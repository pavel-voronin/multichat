import type {
  AgentConfig,
  AgentContextCutoff,
  AgentContextMessage,
  AgentExecutionMode,
  ChatMessage,
  ChatTabState,
  ContextCutoffAnchor,
  DiagnosticsState,
  OpenRouterModel,
  RequestTrace,
  RuntimeConfig,
  RuntimeState,
  SendMessageInput,
  SendSystemMessageInput,
  TabMutationSource,
  TimelineEntry,
  WorkspaceState,
  TransportUsage,
} from './types';
import {
  attachProducedMessageToTrace,
  cloneTraces,
  completeRequestTrace,
  createManualCutoffEntry,
  createRequestTrace,
  findMessageEntryById,
  getActiveManualCutoffIndex,
  getMessageById,
  getMessageInspectionIndexEntry,
  getTimelineMessages,
  pushDebugLog,
  pushRuntimeError,
  pushRuntimeEvent,
  updateMessageSourceTrace,
} from './diagnostics';
import {
  getMessageSenderId,
  isSystemMessage,
  SYSTEM_AUTHOR_NAME,
} from './messages';
import { LocalStoragePersistenceAdapter } from './storage';
import { createId, deepClone } from './utils';
import {
  DEFAULT_TAB_TITLE,
  DEFAULT_HUMAN,
  createEmptyTabState,
  emptyMetrics,
  initialWorkspace,
  mergePersistedWorkspace,
  resolveAutoTabTitle,
  syncParticipants,
  normalizeTabTitle,
} from './workspace';

export type RuntimeListener = (state: RuntimeState) => void;
export type DiagnosticsListener = (state: DiagnosticsState) => void;

export class MultiChatRuntime {
  private readonly listeners = new Set<RuntimeListener>();
  private readonly diagnosticsListeners = new Set<DiagnosticsListener>();
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly maxAutoSweeps: number;
  private readonly maxContextMessages: number;
  private readonly storage;
  private readonly lastProcessedVisibleContextKeys = new Map<
    string,
    Map<string, string>
  >();
  private readonly activeSweepPromises = new Map<string, Promise<void>>();
  private readonly abortControllers = new Map<string, AbortController>();
  private workspace: WorkspaceState;

  constructor(private readonly config: RuntimeConfig) {
    this.now = config.now ?? (() => new Date());
    this.createId = config.idGenerator ?? createId;
    this.maxAutoSweeps = config.maxAutoSweeps ?? 12;
    this.maxContextMessages = config.maxContextMessages ?? 40;
    this.storage = config.storage ?? new LocalStoragePersistenceAdapter();
    this.workspace = mergePersistedWorkspace(
      initialWorkspace(config),
      this.storage.load(),
    );
    for (const tab of this.workspace.tabs) {
      syncParticipants(tab, this.config.humanParticipant ?? DEFAULT_HUMAN);
    }
    this.persist();
  }

  getState(): RuntimeState {
    return this.buildRuntimeState(this.requireActiveTab());
  }

  getWorkspaceState(): WorkspaceState {
    return deepClone(this.workspace);
  }

  getDiagnosticsState(): DiagnosticsState {
    return this.buildDiagnosticsState(this.requireActiveTab());
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeDiagnostics(listener: DiagnosticsListener): () => void {
    this.diagnosticsListeners.add(listener);
    listener(this.getDiagnosticsState());
    return () => {
      this.diagnosticsListeners.delete(listener);
    };
  }

  async listModels(): Promise<OpenRouterModel[]> {
    const apiKey = this.workspace.settings.openRouterApiKey;
    if (!apiKey) {
      throw new Error('OpenRouter API key is missing');
    }

    return this.config.transport.listModels(apiKey);
  }

  getTimelineEntries(tabId = this.workspace.activeTabId): TimelineEntry[] {
    return deepClone(this.requireTab(tabId).timeline);
  }

  getRequestTrace(
    traceId: string,
    tabId = this.workspace.activeTabId,
  ): RequestTrace | null {
    return deepClone(this.requireTab(tabId).requestTraces[traceId] ?? null);
  }

  getRelatedRequestTraces(
    traceId: string,
    tabId = this.workspace.activeTabId,
  ): RequestTrace[] {
    const tab = this.requireTab(tabId);
    const trace = tab.requestTraces[traceId];
    if (!trace) {
      return [];
    }

    const relatedTraceIds = new Set<string>();
    if (trace.parentTraceId) {
      relatedTraceIds.add(trace.parentTraceId);
    }
    for (const childTraceId of trace.childTraceIds) {
      relatedTraceIds.add(childTraceId);
    }
    for (const messageId of [
      ...trace.triggeringMessageIds,
      ...trace.visibleMessageIds,
      ...trace.downstreamMessageIds,
    ]) {
      const index = tab.messageInspectionIndex[messageId];
      for (const relatedTraceId of index?.downstreamTraceIds ?? []) {
        if (relatedTraceId !== traceId) {
          relatedTraceIds.add(relatedTraceId);
        }
      }
      if (index?.sourceTraceId && index.sourceTraceId !== traceId) {
        relatedTraceIds.add(index.sourceTraceId);
      }
    }

    return Array.from(relatedTraceIds)
      .map((relatedTraceId) => tab.requestTraces[relatedTraceId])
      .filter((item): item is RequestTrace => Boolean(item))
      .map((item) => deepClone(item));
  }

  getInspectionSubjectForMessage(
    messageId: string,
    tabId = this.workspace.activeTabId,
  ): {
    message: ChatMessage | null;
    sourceTrace: RequestTrace | null;
    triggeringTraces: RequestTrace[];
    visibleOnlyTraces: RequestTrace[];
    downstreamTraces: RequestTrace[];
  } {
    const tab = this.requireTab(tabId);
    const message = getMessageById(messageId, tab);
    const index = getMessageInspectionIndexEntry(messageId, tab);
    const sourceTrace = index.sourceTraceId
      ? (tab.requestTraces[index.sourceTraceId] ?? null)
      : null;
    const triggeringTraceIds = new Set(index.triggeringTraceIds);
    const visibleOnlyTraceIds = index.visibleTraceIds.filter(
      (traceId) => !triggeringTraceIds.has(traceId),
    );
    const downstreamTraceIds = [
      ...index.triggeringTraceIds,
      ...visibleOnlyTraceIds,
    ];

    return {
      message: deepClone(message ?? null),
      sourceTrace: deepClone(sourceTrace),
      triggeringTraces: cloneTraces(index.triggeringTraceIds, tab),
      visibleOnlyTraces: cloneTraces(visibleOnlyTraceIds, tab),
      downstreamTraces: cloneTraces(downstreamTraceIds, tab),
    };
  }

  getMessageInspectionGraph(
    messageId: string,
    tabId = this.workspace.activeTabId,
  ): {
    message: ChatMessage | null;
    sourceTrace: RequestTrace | null;
    triggeringTraces: RequestTrace[];
    visibleOnlyTraces: RequestTrace[];
    downstreamTraces: RequestTrace[];
    relatedMessages: ChatMessage[];
  } {
    const tab = this.requireTab(tabId);
    const subject = this.getInspectionSubjectForMessage(messageId, tabId);
    const relatedMessageIds = new Set<string>();

    for (const trace of [
      ...subject.triggeringTraces,
      ...subject.visibleOnlyTraces,
      ...(subject.sourceTrace ? [subject.sourceTrace] : []),
    ]) {
      for (const relatedMessageId of [
        ...trace.triggeringMessageIds,
        ...trace.visibleMessageIds,
        ...trace.downstreamMessageIds,
        ...(trace.producedMessageId ? [trace.producedMessageId] : []),
      ]) {
        relatedMessageIds.add(relatedMessageId);
      }
    }

    relatedMessageIds.delete(messageId);

    return {
      ...subject,
      relatedMessages: Array.from(relatedMessageIds)
        .map((relatedMessageId) => getMessageById(relatedMessageId, tab))
        .filter((item): item is ChatMessage => Boolean(item))
        .map((item) => deepClone(item)),
    };
  }

  async sendMessage(
    input: SendMessageInput,
    tabId = this.workspace.activeTabId,
  ): Promise<ChatMessage> {
    const { message, triggersSweep } = this.publishMessage(input, tabId);

    if (triggersSweep) {
      await this.runAgentSweep('message', tabId);
    }

    return message;
  }

  async sendSystemMessage(
    input: SendSystemMessageInput,
    tabId = this.workspace.activeTabId,
  ): Promise<ChatMessage> {
    const { message, triggersSweep } = this.publishSystemMessage(input, tabId);

    if (triggersSweep) {
      await this.runAgentSweep('message', tabId);
    }

    return message;
  }

  createAgent(
    input: Omit<AgentConfig, 'id'> & { id?: string },
    tabId = this.workspace.activeTabId,
  ): AgentConfig {
    const tab = this.requireTab(tabId);
    const agent: AgentConfig = {
      ...input,
      id: input.id ?? this.createId(),
      isEnabled: input.isEnabled ?? true,
      isHidden: input.isHidden ?? false,
      archivedAt: input.archivedAt ?? null,
    };

    tab.agents.push(agent);
    tab.metrics[agent.id] = tab.metrics[agent.id] ?? emptyMetrics();
    syncParticipants(tab, this.config.humanParticipant ?? DEFAULT_HUMAN);
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'agent-created',
        agentId: agent.id,
        agentName: agent.name,
        details: `model=${agent.modelId}`,
      },
    });
    const { triggersSweep } = this.publishSystemMessage(
      {
        content: `${agent.name} joined the chat`,
        system: {
          type: 'participant_joined',
          participantId: agent.id,
          participantName: agent.name,
        },
        triggerSweep: Boolean(this.workspace.settings.openRouterApiKey),
      },
      tab.id,
    );
    if (triggersSweep) {
      void this.runAgentSweep('message', tab.id);
    }
    return deepClone(agent);
  }

  updateAgent(
    agentId: string,
    patch: Partial<Omit<AgentConfig, 'id'>>,
    tabId = this.workspace.activeTabId,
  ): AgentConfig {
    const tab = this.requireTab(tabId);
    const agent = tab.agents.find((item) => item.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    Object.assign(agent, patch);
    syncParticipants(tab, this.config.humanParticipant ?? DEFAULT_HUMAN);
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'agent-updated',
        agentId: agent.id,
        agentName: agent.name,
        details: Object.keys(patch).join(', ') || 'no fields changed',
      },
    });
    this.persistAndNotify();
    return deepClone(agent);
  }

  removeAgent(agentId: string, tabId = this.workspace.activeTabId): void {
    const tab = this.requireTab(tabId);
    const agent = tab.agents.find((item) => item.id === agentId);
    if (!agent) {
      return;
    }

    agent.isEnabled = false;
    agent.isHidden = true;
    agent.archivedAt = this.now().toISOString();
    this.lastProcessedKeysForTab(tab.id).delete(agentId);
    syncParticipants(tab, this.config.humanParticipant ?? DEFAULT_HUMAN);
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'agent-removed',
        agentId: agent.id,
        agentName: agent.name,
        details: 'agent hidden and disabled',
      },
    });
    const { triggersSweep } = this.publishSystemMessage(
      {
        content: `${agent.name} left the chat`,
        system: {
          type: 'participant_left',
          participantId: agent.id,
          participantName: agent.name,
        },
        triggerSweep: Boolean(this.workspace.settings.openRouterApiKey),
      },
      tab.id,
    );
    if (triggersSweep) {
      void this.runAgentSweep('message', tab.id);
    }
  }

  updateSettings(patch: Partial<RuntimeState['settings']>): void {
    this.workspace.settings = {
      ...this.workspace.settings,
      ...patch,
    };
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'settings-updated',
        details: JSON.stringify(patch),
      },
    });
    this.persistAndNotify();
  }

  updateTabContextWindowSize(
    contextWindowSize: number,
    tabId = this.workspace.activeTabId,
  ): void {
    const tab = this.requireTab(tabId);
    const nextContextWindowSize = Math.max(
      1,
      Math.floor(contextWindowSize || 1),
    );
    if (tab.contextWindowSize === nextContextWindowSize) {
      return;
    }

    tab.contextWindowSize = nextContextWindowSize;
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'tab-context-window-updated',
        details: `tabId=${tab.id} contextWindowSize=${nextContextWindowSize}`,
      },
    });
    this.persistAndNotify();
  }

  resetAgentHistoryContext(tabId = this.workspace.activeTabId): void {
    const tab = this.requireTab(tabId);
    tab.timeline = tab.timeline.filter(
      (entry) =>
        !(entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual'),
    );
    const cutoff = createManualCutoffEntry({
      createId: this.createId,
      now: this.now,
    });
    tab.timeline.push(cutoff);
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'history-cutoff-set',
        messageId: getTimelineMessages(tab).at(-1)?.id,
        details: `cutoff=${cutoff.id}`,
      },
    });
    this.persistAndNotify();
  }

  clearHistoryBeforeAgentCutoff(tabId = this.workspace.activeTabId): void {
    const tab = this.requireTab(tabId);
    const cutoffIndex = getActiveManualCutoffIndex(tab);
    if (cutoffIndex === null) {
      return;
    }

    const cutoff = tab.timeline[cutoffIndex];
    if (!cutoff) {
      return;
    }

    tab.timeline = tab.timeline.slice(cutoffIndex + 1);
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'history-cleared',
        messageId: cutoff.id,
        details: `cleared through ${cutoff.id}`,
      },
    });
    this.persistAndNotify();
  }

  moveManualCutoffBefore(
    targetEntryId: string | null,
    tabId = this.workspace.activeTabId,
  ): void {
    const tab = this.requireTab(tabId);
    const cutoffIndex = getActiveManualCutoffIndex(tab);
    if (cutoffIndex === null) {
      return;
    }

    const cutoff = tab.timeline[cutoffIndex];
    if (!cutoff || cutoff.kind !== 'history-cutoff') {
      return;
    }

    const timelineWithoutCutoff = tab.timeline.filter(
      (entry) => entry.id !== cutoff.id,
    );

    if (targetEntryId === null) {
      tab.timeline = [...timelineWithoutCutoff, cutoff];
      this.persistAndNotify();
      return;
    }

    const targetIndex = timelineWithoutCutoff.findIndex(
      (entry) => entry.id === targetEntryId,
    );
    if (targetIndex === -1) {
      return;
    }

    tab.timeline = [
      ...timelineWithoutCutoff.slice(0, targetIndex),
      cutoff,
      ...timelineWithoutCutoff.slice(targetIndex),
    ];
    this.persistAndNotify();
  }

  removeManualCutoff(tabId = this.workspace.activeTabId): void {
    const tab = this.requireTab(tabId);
    const cutoffIndex = getActiveManualCutoffIndex(tab);
    if (cutoffIndex === null) {
      return;
    }

    tab.timeline = tab.timeline.filter((_, index) => index !== cutoffIndex);
    this.persistAndNotify();
  }

  reset(): void {
    for (const tabId of this.workspace.tabs.map((tab) => tab.id)) {
      this.stop(tabId);
    }
    this.storage.reset();
    this.workspace = initialWorkspace({
      ...this.config,
      idGenerator: this.createId,
    });
    this.lastProcessedVisibleContextKeys.clear();
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'runtime-reset',
        details: 'runtime state reset',
      },
    });
    this.persistAndNotify();
  }

  updateHumanParticipant(
    patch: Partial<Pick<RuntimeState['participants'][number], 'name'>>,
    tabId = this.workspace.activeTabId,
  ): void {
    const tab = this.requireTab(tabId);
    const human = tab.participants.find(
      (participant) => participant.role === 'human',
    );
    if (!human) {
      return;
    }

    if (typeof patch.name === 'string' && patch.name.trim()) {
      human.name = patch.name.trim();
    }

    syncParticipants(tab, this.config.humanParticipant ?? DEFAULT_HUMAN);
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'human-updated',
        agentId: human.id,
        agentName: human.name,
        details: 'human participant updated',
      },
    });
    this.persistAndNotify();
  }

  createTab(input?: {
    title?: string;
    activate?: boolean;
    source?: TabMutationSource;
  }): ChatTabState {
    const human = this.config.humanParticipant ?? DEFAULT_HUMAN;
    const tab = createEmptyTabState({
      id: this.createId(),
      title: resolveAutoTabTitle(this.workspace.tabs, input?.title),
      human,
      contextWindowSize: this.maxContextMessages,
    });
    this.workspace.tabs.push(tab);
    if (input?.activate ?? true) {
      this.workspace.activeTabId = tab.id;
    }
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'tab-created',
        details: `tab=${tab.title} tabId=${tab.id} activate=${input?.activate ?? true} source=${input?.source ?? 'user'}`,
      },
    });
    this.persistAndNotify();
    return deepClone(tab);
  }

  renameTab(
    tabId: string,
    title: string,
    _source: TabMutationSource = 'user',
  ): void {
    const tab = this.requireTab(tabId);
    const nextTitle =
      normalizeTabTitle(title) ||
      resolveAutoTabTitle(this.workspace.tabs, undefined, tabId);
    if (nextTitle === tab.title) {
      return;
    }

    const previousTitle = tab.title;
    tab.title = nextTitle;
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'tab-renamed',
        details: `tabId=${tab.id} from=${JSON.stringify(previousTitle)} to=${JSON.stringify(nextTitle)} source=${_source}`,
      },
    });
    const { triggersSweep } = this.publishSystemMessage(
      {
        content: `Topic changed to: ${nextTitle}`,
        system: {
          type: 'topic_changed',
          topicTitle: nextTitle,
        },
        triggerSweep: Boolean(this.workspace.settings.openRouterApiKey),
      },
      tab.id,
    );
    if (triggersSweep) {
      void this.runAgentSweep('message', tab.id);
    }
  }

  activateTab(tabId: string): void {
    this.requireTab(tabId);
    if (this.workspace.activeTabId === tabId) {
      return;
    }

    this.workspace.activeTabId = tabId;
    this.persistAndNotify();
  }

  moveTab(tabId: string, toIndex: number): void {
    const fromIndex = this.workspace.tabs.findIndex((tab) => tab.id === tabId);
    if (fromIndex === -1) {
      return;
    }

    const clampedIndex = Math.max(
      0,
      Math.min(toIndex, this.workspace.tabs.length - 1),
    );
    if (fromIndex === clampedIndex) {
      return;
    }

    const [tab] = this.workspace.tabs.splice(fromIndex, 1);
    this.workspace.tabs.splice(clampedIndex, 0, tab!);
    this.persistAndNotify();
  }

  closeTab(tabId: string, _source: TabMutationSource = 'user'): void {
    const tab = this.requireTab(tabId);
    this.stop(tab.id);
    const index = this.workspace.tabs.findIndex((item) => item.id === tabId);
    if (index === -1) {
      return;
    }

    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'tab-closed',
        details: `tab=${tab.title} tabId=${tab.id} source=${_source}`,
      },
    });
    this.workspace.tabs.splice(index, 1);
    this.abortControllers.delete(tab.id);
    this.lastProcessedVisibleContextKeys.delete(tab.id);

    if (!this.workspace.tabs.length) {
      const replacement = this.createTab({ activate: true });
      this.workspace.activeTabId = replacement.id;
      return;
    }

    if (this.workspace.activeTabId === tabId) {
      const nextTab =
        this.workspace.tabs[index] ?? this.workspace.tabs[index - 1]!;
      this.workspace.activeTabId = nextTab.id;
    }

    this.persistAndNotify();
  }

  stop(tabId = this.workspace.activeTabId): void {
    const maybeTab = this.getTab(tabId);
    if (!maybeTab) {
      return;
    }
    if (
      !maybeTab.execution.isSweepRunning &&
      !this.abortControllers.has(tabId)
    ) {
      return;
    }
    const tab = maybeTab;

    tab.execution.stopRequested = true;
    tab.execution.queuedSweep = false;
    this.abortControllers.get(tabId)?.abort();
    pushRuntimeEvent({
      createId: this.createId,
      now: this.now,
      tab,
      payload: {
        type: 'sweep-stopped',
        details: 'User requested stop',
      },
    });
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'sweep-stopped',
        sweep: tab.execution.sweepCount,
        details: 'User requested stop',
      },
    });
    this.persistAndNotify();
  }

  async runAgentSweep(
    trigger: string,
    tabId = this.workspace.activeTabId,
  ): Promise<void> {
    const tab = this.getTab(tabId);
    if (!tab) {
      return;
    }

    const activeSweepPromise = this.activeSweepPromises.get(tabId);
    if (activeSweepPromise) {
      if (!tab.execution.stopRequested) {
        tab.execution.queuedSweep = true;
      }
      this.persistAndNotify();
      await activeSweepPromise;
      return;
    }

    const sweepPromise = (async () => {
      if (trigger === 'manual') {
        this.lastProcessedKeysForTab(tab.id).clear();
      }

      let loops = 0;
      tab.execution.stopRequested = false;

      do {
        const currentTab = this.getTab(tabId);
        if (!currentTab || currentTab.execution.stopRequested) {
          break;
        }

        currentTab.execution.isSweepRunning = true;
        currentTab.execution.queuedSweep = false;
        currentTab.execution.sweepCount += 1;
        pushRuntimeEvent({
          createId: this.createId,
          now: this.now,
          tab: currentTab,
          payload: {
            type: 'sweep-started',
            details: trigger,
          },
        });
        pushDebugLog({
          now: this.now,
          workspace: this.workspace,
          payload: {
            kind: 'sweep-started',
            sweep: currentTab.execution.sweepCount,
            trigger,
          },
        });
        this.persistAndNotify();

        for (const agent of this.getActiveAgents(currentTab)) {
          const latestTab = this.getTab(tabId);
          if (!latestTab || latestTab.execution.stopRequested) {
            break;
          }
          await this.runAgentTurn(agent, tabId);
        }

        const latestTab = this.getTab(tabId);
        if (!latestTab) {
          break;
        }

        latestTab.execution.isSweepRunning = false;
        pushRuntimeEvent({
          createId: this.createId,
          now: this.now,
          tab: latestTab,
          payload: {
            type: 'sweep-finished',
            details: trigger,
          },
        });
        pushDebugLog({
          now: this.now,
          workspace: this.workspace,
          payload: {
            kind: 'sweep-finished',
            sweep: latestTab.execution.sweepCount,
            trigger,
          },
        });
        this.persistAndNotify();
        loops += 1;
      } while (
        this.getTab(tabId)?.execution.queuedSweep &&
        loops < this.maxAutoSweeps &&
        !this.getTab(tabId)?.execution.stopRequested
      );

      const finalTab = this.getTab(tabId);
      if (finalTab) {
        finalTab.execution.isSweepRunning = false;
        finalTab.execution.queuedSweep = false;
      }
      this.abortControllers.delete(tabId);
      this.persistAndNotify();
    })();

    this.activeSweepPromises.set(tabId, sweepPromise);
    try {
      await sweepPromise;
    } finally {
      if (this.activeSweepPromises.get(tabId) === sweepPromise) {
        this.activeSweepPromises.delete(tabId);
      }
    }
  }

  private async runAgentTurn(agent: AgentConfig, tabId: string): Promise<void> {
    const tab = this.getTab(tabId);
    if (!tab) {
      return;
    }

    if (tab.execution.stopRequested) {
      pushDebugLog({
        now: this.now,
        workspace: this.workspace,
        payload: {
          kind: 'turn-skipped',
          sweep: tab.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          skipReason: 'stop_requested',
        },
      });
      return;
    }

    const visibleMessages = this.getVisibleMessagesForAgent(agent.id, tabId);
    if (!this.hasNewVisibleInputForAgent(agent.id, tab)) {
      pushDebugLog({
        now: this.now,
        workspace: this.workspace,
        payload: {
          kind: 'turn-skipped',
          sweep: tab.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          skipReason: 'no_new_input',
          visibleMessageIds: visibleMessages.map((message) => message.id),
          nonSelfVisibleMessageIds: this.getNonSelfVisibleMessageIds(
            agent.id,
            tab,
          ),
          contextKeyPrev:
            this.lastProcessedKeysForTab(tab.id).get(agent.id) ?? '',
          contextKeyNext: this.getVisibleContextKey(agent.id, tab),
        },
      });
      return;
    }

    const apiKey = this.workspace.settings.openRouterApiKey;
    if (!apiKey) {
      pushDebugLog({
        now: this.now,
        workspace: this.workspace,
        payload: {
          kind: 'turn-skipped',
          sweep: tab.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          skipReason: 'no_api_key',
          visibleMessageIds: visibleMessages.map((message) => message.id),
          nonSelfVisibleMessageIds: this.getNonSelfVisibleMessageIds(
            agent.id,
            tab,
          ),
          contextKeyPrev:
            this.lastProcessedKeysForTab(tab.id).get(agent.id) ?? '',
          contextKeyNext: this.getVisibleContextKey(agent.id, tab),
        },
      });
      pushRuntimeError({
        createId: this.createId,
        now: this.now,
        tab,
        workspace: this.workspace,
        participantName: this.participantName,
        payload: {
          agentId: agent.id,
          message: 'OpenRouter API key is missing',
        },
      });
      return;
    }

    const mode = this.chooseAgentMode(agent);
    const abortController = new AbortController();
    this.abortControllers.set(tab.id, abortController);
    const previousContextKey =
      this.lastProcessedKeysForTab(tab.id).get(agent.id) ?? '';
    const nextContextKey = this.getVisibleContextKey(agent.id, tab);
    const nonSelfVisibleMessageIds = this.getNonSelfVisibleMessageIds(
      agent.id,
      tab,
    );
    const triggeringMessageIds = this.getTriggeringMessageIds(
      previousContextKey,
      nonSelfVisibleMessageIds,
    );
    const trace = createRequestTrace({
      createId: this.createId,
      now: this.now,
      tab,
      agent,
      mode,
      fallback: false,
      parentTraceId: null,
      triggeringMessageIds,
      visibleMessageIds: visibleMessages.map((message) => message.id),
      nonSelfVisibleMessageIds,
    });
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'turn-requested',
        sweep: tab.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        mode,
        fallback: false,
        visibleMessageIds: visibleMessages.map((message) => message.id),
        nonSelfVisibleMessageIds,
        triggeringMessageIds,
        contextKeyPrev: previousContextKey,
        contextKeyNext: nextContextKey,
      },
    });

    try {
      const result = await this.config.transport.runAgentTurn({
        apiKey,
        context: {
          agent,
          participants: deepClone(tab.participants),
          visibleMessages,
        },
        mode,
        signal: abortController.signal,
      });

      this.markVisibleContextProcessed(agent.id, tab);
      this.applyUsage(agent.id, result.usage, tab);
      this.applyDownstreamPromptCost(agent, visibleMessages, result.usage, tab);
      this.updateToolSupport(agent.id, result.mode, tab);
      completeRequestTrace({
        now: this.now,
        traceId: trace.id,
        tab,
        status: 'succeeded',
        usage: result.usage,
        action: result.action,
        promptCostUsd: this.getPromptCostUsd(
          tab.agents.find((item) => item.id === trace.agentId) ?? agent,
          result.usage,
        ),
      });

      if (result.action.type === 'stay_silent') {
        const requestCostUsd = result.usage?.estimatedCost;
        const ownPromptCostUsd = this.getPromptCostUsd(agent, result.usage);
        pushRuntimeEvent({
          createId: this.createId,
          now: this.now,
          tab,
          payload: {
            type: 'silent-decision',
            agentId: agent.id,
            details: result.action.reason,
            sourceTraceId: trace.id,
            requestCostUsd,
            ownPromptCostUsd,
            costUsd: requestCostUsd,
          },
        });
        pushDebugLog({
          now: this.now,
          workspace: this.workspace,
          payload: {
            kind: 'turn-result',
            sweep: tab.execution.sweepCount,
            agentId: agent.id,
            agentName: agent.name,
            mode: result.mode,
            fallback: false,
            actionType: result.action.type,
            details: result.action.reason,
          },
        });
        this.persistAndNotify();
        return;
      }

      const sentMessage = await this.sendMessage(
        {
          senderId: agent.id,
          content: result.action.text,
          target: result.action.type === 'speak_public' ? 'public' : 'private',
          recipientId:
            result.action.type === 'send_private'
              ? result.action.to
              : undefined,
          requestCostUsd: result.usage?.estimatedCost,
          ownPromptCostUsd: this.getPromptCostUsd(agent, result.usage),
          createdInSweep: tab.execution.sweepCount,
          sourceTraceId: trace.id,
          triggerSweep: false,
        },
        tabId,
      );
      attachProducedMessageToTrace(trace.id, sentMessage.id, tab);
      pushDebugLog({
        now: this.now,
        workspace: this.workspace,
        payload: {
          kind: 'turn-result',
          sweep: tab.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          mode: result.mode,
          fallback: false,
          actionType: result.action.type,
          messageId: sentMessage.id,
          target: sentMessage.target,
          recipientId: sentMessage.recipientId,
          content: result.action.text,
        },
      });
      tab.execution.queuedSweep = true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        completeRequestTrace({
          now: this.now,
          traceId: trace.id,
          tab,
          status: 'aborted',
          error: 'Agent request aborted',
          promptCostUsd: 0,
        });
        pushRuntimeEvent({
          createId: this.createId,
          now: this.now,
          tab,
          payload: {
            type: 'sweep-stopped',
            agentId: agent.id,
            details: 'Agent request aborted',
          },
        });
        pushDebugLog({
          now: this.now,
          workspace: this.workspace,
          payload: {
            kind: 'sweep-stopped',
            sweep: tab.execution.sweepCount,
            agentId: agent.id,
            agentName: agent.name,
            details: 'Agent request aborted',
          },
        });
        this.persistAndNotify();
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown agent runtime error';
      completeRequestTrace({
        now: this.now,
        traceId: trace.id,
        tab,
        status: 'failed',
        error: message,
        promptCostUsd: 0,
      });
      pushRuntimeError({
        createId: this.createId,
        now: this.now,
        tab,
        workspace: this.workspace,
        participantName: this.participantName,
        payload: {
          agentId: agent.id,
          message: 'Agent turn failed',
          details: message,
          sourceTraceId: trace.id,
        },
      });

      if (mode === 'tools') {
        this.updateAgent(
          agent.id,
          {
            capabilities: {
              ...agent.capabilities,
              supportsToolUse: 'unsupported',
            },
          },
          tabId,
        );

        try {
          const fallbackTrace = createRequestTrace({
            createId: this.createId,
            now: this.now,
            tab,
            agent,
            mode: 'json',
            fallback: true,
            parentTraceId: trace.id,
            triggeringMessageIds,
            visibleMessageIds: visibleMessages.map((message) => message.id),
            nonSelfVisibleMessageIds,
          });
          pushDebugLog({
            now: this.now,
            workspace: this.workspace,
            payload: {
              kind: 'turn-requested',
              sweep: tab.execution.sweepCount,
              agentId: agent.id,
              agentName: agent.name,
              mode: 'json',
              fallback: true,
              visibleMessageIds: visibleMessages.map((message) => message.id),
              nonSelfVisibleMessageIds,
              triggeringMessageIds,
              contextKeyPrev: previousContextKey,
              contextKeyNext: nextContextKey,
              details: 'JSON fallback after tool failure',
            },
          });
          const fallback = await this.config.transport.runAgentTurn({
            apiKey,
            context: {
              agent: {
                ...agent,
                capabilities: {
                  ...agent.capabilities,
                  supportsToolUse: 'unsupported',
                },
              },
              participants: deepClone(tab.participants),
              visibleMessages,
            },
            mode: 'json',
            signal: abortController.signal,
          });

          this.markVisibleContextProcessed(agent.id, tab);
          this.applyUsage(agent.id, fallback.usage, tab);
          this.applyDownstreamPromptCost(
            agent,
            visibleMessages,
            fallback.usage,
            tab,
          );
          completeRequestTrace({
            now: this.now,
            traceId: fallbackTrace.id,
            tab,
            status: 'succeeded',
            usage: fallback.usage,
            action: fallback.action,
            promptCostUsd: this.getPromptCostUsd(
              tab.agents.find((item) => item.id === fallbackTrace.agentId) ??
                agent,
              fallback.usage,
            ),
          });
          if (fallback.action.type === 'stay_silent') {
            const requestCostUsd = fallback.usage?.estimatedCost;
            const ownPromptCostUsd = this.getPromptCostUsd(
              agent,
              fallback.usage,
            );
            pushRuntimeEvent({
              createId: this.createId,
              now: this.now,
              tab,
              payload: {
                type: 'silent-decision',
                agentId: agent.id,
                details: fallback.action.reason,
                sourceTraceId: fallbackTrace.id,
                requestCostUsd,
                ownPromptCostUsd,
                costUsd: requestCostUsd,
              },
            });
            pushDebugLog({
              now: this.now,
              workspace: this.workspace,
              payload: {
                kind: 'turn-result',
                sweep: tab.execution.sweepCount,
                agentId: agent.id,
                agentName: agent.name,
                mode: 'json',
                fallback: true,
                actionType: fallback.action.type,
                details: fallback.action.reason,
              },
            });
            this.persistAndNotify();
            return;
          }

          const sentMessage = await this.sendMessage(
            {
              senderId: agent.id,
              target:
                fallback.action.type === 'speak_public' ? 'public' : 'private',
              recipientId:
                fallback.action.type === 'send_private'
                  ? fallback.action.to
                  : undefined,
              content: fallback.action.text,
              requestCostUsd: fallback.usage?.estimatedCost,
              ownPromptCostUsd: this.getPromptCostUsd(agent, fallback.usage),
              createdInSweep: tab.execution.sweepCount,
              sourceTraceId: fallbackTrace.id,
              triggerSweep: false,
            },
            tabId,
          );
          attachProducedMessageToTrace(fallbackTrace.id, sentMessage.id, tab);
          pushDebugLog({
            now: this.now,
            workspace: this.workspace,
            payload: {
              kind: 'turn-result',
              sweep: tab.execution.sweepCount,
              agentId: agent.id,
              agentName: agent.name,
              mode: 'json',
              fallback: true,
              actionType: fallback.action.type,
              messageId: sentMessage.id,
              target: sentMessage.target,
              recipientId: sentMessage.recipientId,
              content: fallback.action.text,
            },
          });
          tab.execution.queuedSweep = true;
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : 'Unknown JSON fallback error';
          const fallbackTraceId =
            tab.requestTraces[trace.id]?.childTraceIds.at(-1) ?? null;
          if (fallbackTraceId) {
            completeRequestTrace({
              now: this.now,
              traceId: fallbackTraceId,
              tab,
              status:
                fallbackError instanceof Error &&
                fallbackError.name === 'AbortError'
                  ? 'aborted'
                  : 'failed',
              error: fallbackMessage,
              promptCostUsd: 0,
            });
          }
          pushRuntimeError({
            createId: this.createId,
            now: this.now,
            tab,
            workspace: this.workspace,
            participantName: this.participantName,
            payload: {
              agentId: agent.id,
              message: 'JSON fallback failed',
              details: fallbackMessage,
              sourceTraceId: fallbackTraceId ?? undefined,
            },
          });
          this.persistAndNotify();
        }
      } else {
        this.persistAndNotify();
      }
    } finally {
      if (this.abortControllers.get(tab.id) === abortController) {
        this.abortControllers.delete(tab.id);
      }
    }
  }

  private chooseAgentMode(agent: AgentConfig): AgentExecutionMode {
    if (
      agent.capabilities.prefersTools &&
      agent.capabilities.supportsToolUse !== 'unsupported'
    ) {
      return 'tools';
    }

    return 'json';
  }

  private updateToolSupport(
    agentId: string,
    mode: AgentExecutionMode,
    tab: ChatTabState,
  ): void {
    if (mode !== 'tools') {
      return;
    }

    const agent = tab.agents.find((item) => item.id === agentId);
    if (!agent) {
      return;
    }

    agent.capabilities.supportsToolUse = 'supported';
  }

  private applyDownstreamPromptCost(
    receivingAgent: AgentConfig,
    visibleMessages: AgentContextMessage[],
    usage: TransportUsage | undefined,
    tab: ChatTabState,
  ): void {
    const promptCostUsd = this.getPromptCostUsd(receivingAgent, usage);
    if (promptCostUsd <= 0) {
      return;
    }

    const listenedMessages = visibleMessages.filter(
      (message) => message.senderId !== receivingAgent.id,
    );
    if (!listenedMessages.length) {
      return;
    }

    const promptCostPerMessage = promptCostUsd / listenedMessages.length;
    for (const visibleMessage of listenedMessages) {
      const entry = findMessageEntryById(visibleMessage.id, tab);
      if (!entry) {
        continue;
      }
      const message = entry.message;

      message.downstreamPromptCostUsd =
        (message.downstreamPromptCostUsd ?? 0) + promptCostPerMessage;
      const existingContributors =
        message.downstreamPromptCostContributors ?? [];
      const existingContributor = existingContributors.find(
        (contributor) => contributor.agentId === receivingAgent.id,
      );
      if (existingContributor) {
        existingContributor.promptCostUsd += promptCostPerMessage;
        existingContributor.listenCount += 1;
      } else {
        existingContributors.push({
          agentId: receivingAgent.id,
          promptCostUsd: promptCostPerMessage,
          listenCount: 1,
        });
      }
      message.downstreamPromptCostContributors = existingContributors;
      const requestCostUsd = message.requestCostUsd ?? 0;
      message.costUsd = requestCostUsd + message.downstreamPromptCostUsd;
    }
  }

  private getPromptCostUsd(agent: AgentConfig, usage?: TransportUsage): number {
    const promptTokens = usage?.promptTokens;
    if (!promptTokens) {
      return 0;
    }

    const promptPrice = Number(agent.pricing?.prompt);
    if (!Number.isFinite(promptPrice) || promptPrice <= 0) {
      return 0;
    }

    return promptTokens * promptPrice;
  }

  getVisibleMessagesForAgent(
    agentId: string,
    tabId = this.workspace.activeTabId,
  ): AgentContextMessage[] {
    const tab = this.requireTab(tabId);
    const contextWindowSize = tab.contextWindowSize ?? this.maxContextMessages;
    const visibleMessages = this.getContextWindowMessages(tab)
      .slice(-contextWindowSize)
      .filter((message) => this.isMessageVisibleToAgent(message, agentId));

    return visibleMessages.slice(-contextWindowSize).map((message) => {
      const senderId = getMessageSenderId(message);
      const sender = tab.participants.find(
        (participant) => participant.id === senderId,
      );
      const recipient = tab.participants.find(
        (participant) => participant.id === message.recipientId,
      );

      return {
        id: message.id,
        authorType: message.author.type,
        senderId: senderId ?? undefined,
        senderName: isSystemMessage(message)
          ? SYSTEM_AUTHOR_NAME
          : (sender?.name ?? senderId ?? ''),
        target: message.target,
        recipientId: message.recipientId,
        recipientName: recipient?.name,
        content: message.content,
        createdAt: message.createdAt,
      };
    });
  }

  getAgentContextCutoffs(
    tabId = this.workspace.activeTabId,
  ): AgentContextCutoff[] {
    const tab = this.requireTab(tabId);
    const activeAgents = this.getActiveAgents(tab);
    const contextWindowSize = tab.contextWindowSize ?? this.maxContextMessages;
    const contextMessages =
      this.getContextWindowMessages(tab).slice(-contextWindowSize);
    const anchor = contextMessages[0]
      ? {
          kind: 'before-message' as const,
          messageId: contextMessages[0].id,
        }
      : ({
          kind: getTimelineMessages(tab).length ? 'end' : 'start',
        } as const);

    return [
      {
        anchor,
        agentIds: activeAgents.map((agent) => agent.id),
        agentNames: activeAgents.map((agent) => agent.name),
      },
    ];
  }

  isMessageVisibleToAgent(message: ChatMessage, agentId: string): boolean {
    if (message.target === 'public') {
      return true;
    }

    return (
      getMessageSenderId(message) === agentId || message.recipientId === agentId
    );
  }

  isMessageVisibleToParticipant(
    message: ChatMessage,
    participantId: string,
  ): boolean {
    if (message.target === 'public') {
      return true;
    }

    if (participantId === DEFAULT_HUMAN.id) {
      return true;
    }

    return (
      getMessageSenderId(message) === participantId ||
      message.recipientId === participantId
    );
  }

  private getContextWindowMessages(tab: ChatTabState): ChatMessage[] {
    return getTimelineMessages(tab).filter((message) => {
      const cutoffIndex = getActiveManualCutoffIndex(tab);
      if (cutoffIndex === null) {
        return true;
      }

      const entryIndex = tab.timeline.findIndex(
        (entry) => entry.id === message.id,
      );
      return entryIndex > cutoffIndex;
    });
  }

  private getNonSelfVisibleMessageIds(
    agentId: string,
    tab: ChatTabState,
  ): string[] {
    return this.getVisibleMessagesForAgent(agentId, tab.id)
      .filter((message) => message.senderId !== agentId)
      .map((message) => message.id);
  }

  private getVisibleContextKey(agentId: string, tab: ChatTabState): string {
    return this.getNonSelfVisibleMessageIds(agentId, tab).join('|');
  }

  private hasNewVisibleInputForAgent(
    agentId: string,
    tab: ChatTabState,
  ): boolean {
    const keys = this.lastProcessedKeysForTab(tab.id);
    if (!keys.has(agentId)) {
      return true;
    }

    const previousIds = new Set(
      (keys.get(agentId) ?? '').split('|').filter(Boolean),
    );
    const nextIds = this.getNonSelfVisibleMessageIds(agentId, tab);
    return nextIds.some((messageId) => !previousIds.has(messageId));
  }

  private markVisibleContextProcessed(
    agentId: string,
    tab: ChatTabState,
  ): void {
    this.lastProcessedKeysForTab(tab.id).set(
      agentId,
      this.getVisibleContextKey(agentId, tab),
    );
  }

  private getTriggeringMessageIds(
    previousContextKey: string,
    nextVisibleMessageIds: string[],
  ): string[] {
    const previousMessageIds = new Set(
      previousContextKey ? previousContextKey.split('|').filter(Boolean) : [],
    );
    return nextVisibleMessageIds.filter(
      (messageId) => !previousMessageIds.has(messageId),
    );
  }

  private getActiveAgents(tab: ChatTabState): AgentConfig[] {
    return tab.agents.filter(
      (agent) => agent.isEnabled !== false && agent.isHidden !== true,
    );
  }

  private applyUsage(
    agentId: string,
    usage: TransportUsage | undefined,
    tab: ChatTabState,
  ): void {
    if (!usage) {
      return;
    }

    const metrics = tab.metrics[agentId] ?? emptyMetrics();
    metrics.requestCount += 1;
    metrics.promptTokens += usage.promptTokens ?? 0;
    metrics.completionTokens += usage.completionTokens ?? 0;
    metrics.totalTokens += usage.totalTokens ?? 0;
    metrics.estimatedCost += usage.estimatedCost ?? 0;
    tab.metrics[agentId] = metrics;
  }

  private publishSystemMessage(
    input: SendSystemMessageInput,
    tabId: string,
  ): { message: ChatMessage; triggersSweep: boolean } {
    return this.publishMessage(
      {
        content: input.content,
        target: 'public',
        triggerSweep: input.triggerSweep,
        kind: 'system',
        system: input.system,
      },
      tabId,
    );
  }

  private publishMessage(
    input: Omit<SendMessageInput, 'senderId'> & {
      senderId?: string;
      kind?: ChatMessage['kind'];
      system?: ChatMessage['system'];
    },
    tabId: string,
  ): { message: ChatMessage; triggersSweep: boolean } {
    const tab = this.requireTab(tabId);
    if (input.target === 'private' && !input.recipientId) {
      throw new Error('Private message requires recipientId');
    }
    if (input.kind !== 'system' && !input.senderId) {
      throw new Error('Participant message requires senderId');
    }

    const triggersSweep = input.triggerSweep ?? true;
    const createdInSweep =
      input.createdInSweep ??
      (triggersSweep ? tab.execution.sweepCount + 1 : undefined);

    const message: ChatMessage = {
      id: this.createId(),
      author:
        input.kind === 'system'
          ? { type: 'system' }
          : { type: 'participant', participantId: input.senderId! },
      kind: input.kind ?? 'participant',
      target: input.target,
      recipientId: input.recipientId,
      content: input.content.trim(),
      system: input.system,
      createdAt: this.now().toISOString(),
      requestCostUsd: input.requestCostUsd ?? input.costUsd,
      ownPromptCostUsd: input.ownPromptCostUsd,
      downstreamPromptCostUsd: input.downstreamPromptCostUsd,
      downstreamPromptCostContributors: input.downstreamPromptCostContributors,
      costUsd:
        (input.requestCostUsd ?? input.costUsd ?? 0) +
          (input.downstreamPromptCostUsd ?? 0) || undefined,
      createdInSweep,
      sourceTraceId: input.sourceTraceId,
    };

    tab.timeline.push({
      id: message.id,
      createdAt: message.createdAt,
      kind: 'message',
      message,
    });
    updateMessageSourceTrace(message.id, input.sourceTraceId, tab);
    pushDebugLog({
      now: this.now,
      workspace: this.workspace,
      payload: {
        kind: 'message-created',
        sweep: message.createdInSweep,
        messageId: message.id,
        agentId: input.kind === 'system' ? undefined : input.senderId,
        agentName:
          input.kind === 'system'
            ? SYSTEM_AUTHOR_NAME
            : this.participantName(input.senderId!, tab),
        target: message.target,
        recipientId: message.recipientId,
        content: message.content,
        details: triggersSweep
          ? 'message triggers sweep'
          : 'message does not trigger sweep',
      },
    });
    this.persistAndNotify();

    return { message, triggersSweep };
  }

  private participantName(participantId: string, tab: ChatTabState): string {
    return (
      tab.participants.find((participant) => participant.id === participantId)
        ?.name ?? participantId
    );
  }

  private lastProcessedKeysForTab(tabId: string): Map<string, string> {
    let keys = this.lastProcessedVisibleContextKeys.get(tabId);
    if (!keys) {
      keys = new Map<string, string>();
      this.lastProcessedVisibleContextKeys.set(tabId, keys);
    }
    return keys;
  }

  private getTab(tabId: string): ChatTabState | undefined {
    return this.workspace.tabs.find((tab) => tab.id === tabId);
  }

  private requireTab(tabId: string): ChatTabState {
    const tab = this.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab not found: ${tabId}`);
    }
    return tab;
  }

  private requireActiveTab(): ChatTabState {
    return this.requireTab(this.workspace.activeTabId);
  }

  private resolveAutoTabTitle(
    preferredTitle?: string,
    excludeTabId?: string,
  ): string {
    const normalizedPreferred = normalizeTabTitle(preferredTitle);
    if (normalizedPreferred) {
      return normalizedPreferred;
    }

    const titles = new Set(
      this.workspace.tabs
        .filter((tab) => tab.id !== excludeTabId)
        .map((tab) => tab.title),
    );
    if (!titles.has(DEFAULT_TAB_TITLE)) {
      return DEFAULT_TAB_TITLE;
    }

    let index = 2;
    while (titles.has(`${DEFAULT_TAB_TITLE}${index}`)) {
      index += 1;
    }

    return `${DEFAULT_TAB_TITLE}${index}`;
  }

  private buildRuntimeState(tab: ChatTabState): RuntimeState {
    return deepClone({
      activeTabId: this.workspace.activeTabId,
      contextWindowSize: tab.contextWindowSize,
      participants: tab.participants,
      agents: tab.agents,
      timeline: tab.timeline,
      metrics: tab.metrics,
      settings: this.workspace.settings,
      execution: tab.execution,
    });
  }

  private buildDiagnosticsState(tab: ChatTabState): DiagnosticsState {
    return deepClone({
      activeTabId: this.workspace.activeTabId,
      debugLogs: this.workspace.debugLogs,
      errors: this.workspace.errors,
      requestTraces: tab.requestTraces,
      messageInspectionIndex: tab.messageInspectionIndex,
    });
  }

  private persist(): void {
    this.storage.save(deepClone(this.workspace));
  }

  private persistAndNotify(): void {
    this.persist();
    const snapshot = this.getState();
    const diagnosticsSnapshot = this.getDiagnosticsState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    for (const listener of this.diagnosticsListeners) {
      listener(diagnosticsSnapshot);
    }
  }
}

export function createMultiChatRuntime(
  config: RuntimeConfig,
): MultiChatRuntime {
  return new MultiChatRuntime(config);
}
