import type {
  AgentConfig,
  AgentContextCutoff,
  AgentContextMessage,
  ChatMessage,
  ChatTabState,
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
} from './types';
import {
  createManualCutoffEntry,
  getActiveManualCutoffIndex,
  getTimelineMessages,
  pushDebugLog,
  pushRuntimeEvent,
} from './diagnostics';
import {
  getInspectionSubjectForMessage as getInspectionSubjectFn,
  getMessageInspectionGraph as getMessageInspectionGraphFn,
  getRelatedRequestTraces as getRelatedRequestTracesFn,
} from './traces';
import {
  getAgentContextCutoffs,
  getVisibleMessagesForAgent as getVisibleMessagesForAgentFn,
  isMessageVisibleToAgent as isMessageVisibleToAgentFn,
  isMessageVisibleToParticipant as isMessageVisibleToParticipantFn,
} from './context-routing';
import {
  publishMessageToTab,
  publishSystemMessageToTab,
} from './messaging';
import {
  runAgentSweepFn,
  type ExecutionContext,
} from './execution';
import { LocalStoragePersistenceAdapter } from './storage';
import { createId, deepClone } from './utils';
import {
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
    return getRelatedRequestTracesFn(traceId, this.requireTab(tabId));
  }

  getInspectionSubjectForMessage(
    messageId: string,
    tabId = this.workspace.activeTabId,
  ) {
    return getInspectionSubjectFn(messageId, this.requireTab(tabId));
  }

  getMessageInspectionGraph(
    messageId: string,
    tabId = this.workspace.activeTabId,
  ) {
    return getMessageInspectionGraphFn(messageId, this.requireTab(tabId));
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
    await runAgentSweepFn(trigger, tabId, this.buildExecutionContext());
  }

  private buildExecutionContext(): ExecutionContext {
    return {
      workspace: this.workspace,
      transport: this.config.transport,
      abortControllers: this.abortControllers,
      activeSweepPromises: this.activeSweepPromises,
      maxAutoSweeps: this.maxAutoSweeps,
      maxContextMessages: this.maxContextMessages,
      now: this.now,
      createId: this.createId,
      lastProcessedKeys: this.lastProcessedVisibleContextKeys,
      participantName: (participantId, tab) =>
        this.participantName(participantId, tab),
      sendMessage: (input, tabId) => this.sendMessage(input, tabId),
      updateAgent: (agentId, patch, tabId) =>
        this.updateAgent(agentId, patch, tabId),
      persistAndNotify: () => this.persistAndNotify(),
    };
  }

  getVisibleMessagesForAgent(
    agentId: string,
    tabId = this.workspace.activeTabId,
  ): AgentContextMessage[] {
    return getVisibleMessagesForAgentFn(
      agentId,
      this.requireTab(tabId),
      this.maxContextMessages,
    );
  }

  getAgentContextCutoffs(tabId = this.workspace.activeTabId): AgentContextCutoff[] {
    return getAgentContextCutoffs(this.requireTab(tabId), this.maxContextMessages);
  }

  isMessageVisibleToAgent(message: ChatMessage, agentId: string): boolean {
    return isMessageVisibleToAgentFn(message, agentId);
  }

  isMessageVisibleToParticipant(message: ChatMessage, participantId: string): boolean {
    return isMessageVisibleToParticipantFn(message, participantId);
  }

  private publishSystemMessage(
    input: SendSystemMessageInput,
    tabId: string,
  ): { message: ChatMessage; triggersSweep: boolean } {
    const tab = this.requireTab(tabId);
    const result = publishSystemMessageToTab(
      input,
      tab,
      this.workspace,
      this.now,
      this.createId,
    );
    this.persistAndNotify();
    return result;
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
    const result = publishMessageToTab(
      input,
      tab,
      this.workspace,
      this.now,
      this.createId,
    );
    this.persistAndNotify();
    return result;
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
