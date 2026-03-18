import type {
  AgentConfig,
  AgentContextCutoff,
  AgentContextMessage,
  AgentExecutionMode,
  AgentMetrics,
  ChatMessage,
  ChatTabState,
  ChatTabSummary,
  ContextCutoffAnchor,
  DebugLogEntry,
  MessageInspectionIndex,
  OpenRouterModel,
  RequestTrace,
  RuntimeConfig,
  RuntimeError,
  RuntimeEvent,
  RuntimeState,
  SendMessageInput,
  SettingsState,
  TabMutationSource,
  TimelineEntry,
  TimelineFilterState,
  TimelineHistoryCutoffEntry,
  TimelineMessageEntry,
  VisibleTimelineEntry,
  WorkspaceState,
  TransportUsage,
} from './types';
import { LocalStoragePersistenceAdapter } from './storage';
import { createId, deepClone } from './utils';

export type RuntimeListener = (state: RuntimeState) => void;

const DEFAULT_HUMAN = {
  id: 'human',
  name: 'Human',
  role: 'human',
} as const;

const DEFAULT_TAB_TITLE = '#default';

function emptyMetrics(): AgentMetrics {
  return {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  };
}

function normalizeAgentConfig(agent: AgentConfig): AgentConfig {
  return {
    ...agent,
    isEnabled: agent.isEnabled ?? true,
    isHidden: agent.isHidden ?? false,
    archivedAt: agent.archivedAt ?? null,
  };
}

function initialSettings(config: RuntimeConfig): SettingsState {
  return {
    openRouterApiKey: '',
    defaultContextWindowSize: config.maxContextMessages ?? 40,
    showContextCutoffs: false,
    showSilentDecisions: false,
    costDisplayMode: 'request',
  };
}

function initialExecutionState(): ChatTabState['execution'] {
  return {
    isSweepRunning: false,
    queuedSweep: false,
    sweepCount: 0,
    stopRequested: false,
  };
}

function createEmptyTabState(input: {
  id: string;
  title?: string;
  human: ChatTabState['participants'][number];
}): ChatTabState {
  return {
    id: input.id,
    title: input.title ?? DEFAULT_TAB_TITLE,
    participants: [deepClone(input.human)],
    agents: [],
    timeline: [],
    metrics: {},
    debugLogs: [],
    errors: [],
    execution: initialExecutionState(),
    requestTraces: {},
    messageInspectionIndex: {},
    draftMessage: '',
    uiMeta: {
      unreadCount: 0,
      headerBadge: null,
    },
  };
}

function initialWorkspace(config: RuntimeConfig): WorkspaceState {
  const human = config.humanParticipant ?? DEFAULT_HUMAN;
  const tabId = 'tab-default';
  return {
    settings: initialSettings(config),
    tabs: [
      createEmptyTabState({
        id: tabId,
        human,
      }),
    ],
    activeTabId: tabId,
  };
}

function mergePersistedWorkspace(
  base: WorkspaceState,
  persisted: Partial<WorkspaceState> | null,
): WorkspaceState {
  if (!persisted) {
    return base;
  }

  const tabs = (persisted.tabs ?? [])
    .map((tab) => normalizeTabState(tab, base.settings.defaultContextWindowSize))
    .filter(Boolean) as ChatTabState[];

  if (!tabs.length) {
    return base;
  }

  const activeTabId = tabs.some((tab) => tab.id === persisted.activeTabId)
    ? persisted.activeTabId!
    : tabs[0]!.id;

  return {
    settings: {
      ...base.settings,
      ...persisted.settings,
    },
    tabs,
    activeTabId,
  };
}

function normalizeTabState(
  tab: Partial<ChatTabState>,
  _defaultContextWindowSize: number,
): ChatTabState | null {
  if (!tab.id) {
    return null;
  }

  const participants = tab.participants?.length
    ? tab.participants
    : [deepClone(DEFAULT_HUMAN)];

  return {
    id: tab.id,
    title: typeof tab.title === 'string' && tab.title.trim()
      ? tab.title
      : DEFAULT_TAB_TITLE,
    participants,
    agents: (tab.agents ?? []).map(normalizeAgentConfig),
    timeline: tab.timeline ?? [],
    metrics: tab.metrics ?? {},
    debugLogs: tab.debugLogs ?? [],
    errors: tab.errors ?? [],
    execution: {
      ...initialExecutionState(),
      ...tab.execution,
      isSweepRunning: false,
      queuedSweep: false,
      stopRequested: false,
    },
    requestTraces: tab.requestTraces ?? {},
    messageInspectionIndex: tab.messageInspectionIndex ?? {},
    draftMessage: tab.draftMessage ?? '',
    uiMeta: {
      unreadCount: tab.uiMeta?.unreadCount ?? 0,
      headerBadge: tab.uiMeta?.headerBadge ?? null,
    },
  };
}

function normalizeTabTitle(title: string | undefined | null): string {
  return title?.trim() ?? '';
}

export class MultiChatRuntime {
  private readonly listeners = new Set<RuntimeListener>();
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly maxAutoSweeps: number;
  private readonly maxContextMessages: number;
  private readonly storage;
  private readonly lastProcessedVisibleContextKeys = new Map<
    string,
    Map<string, string>
  >();
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
      this.syncParticipants(tab);
    }
    this.persist();
  }

  getState(): RuntimeState {
    return this.buildRuntimeState(this.requireActiveTab());
  }

  getWorkspaceState(): WorkspaceState {
    return deepClone(this.workspace);
  }

  getTabSummaries(): ChatTabSummary[] {
    return this.workspace.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      isActive: tab.id === this.workspace.activeTabId,
      unreadCount: tab.uiMeta.unreadCount ?? 0,
      headerBadge: tab.uiMeta.headerBadge ?? null,
    }));
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
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

  getRequestTrace(traceId: string, tabId = this.workspace.activeTabId): RequestTrace | null {
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
    const message = this.getMessageById(messageId, tab);
    const index = this.getMessageInspectionIndexEntry(messageId, tab);
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
      triggeringTraces: this.cloneTraces(index.triggeringTraceIds, tab),
      visibleOnlyTraces: this.cloneTraces(visibleOnlyTraceIds, tab),
      downstreamTraces: this.cloneTraces(downstreamTraceIds, tab),
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
        .map((relatedMessageId) => this.getMessageById(relatedMessageId, tab))
        .filter((item): item is ChatMessage => Boolean(item))
        .map((item) => deepClone(item)),
    };
  }

  getVisibleTimelineEntries(input: {
    participantId: string;
    filters?: Partial<TimelineFilterState>;
    tabId?: string;
  }): VisibleTimelineEntry[] {
    const tab = this.requireTab(input.tabId ?? this.workspace.activeTabId);
    const filters: TimelineFilterState = {
      showTechnicalEvents: false,
      showPreviewCutoffs: false,
      ...input.filters,
    };
    const activeManualCutoffIndex = this.getActiveManualCutoffIndex(tab);
    const visibleEntries: VisibleTimelineEntry[] = [];
    const visibleMessages: ChatMessage[] = [];

    for (const [index, entry] of tab.timeline.entries()) {
      if (entry.kind === 'message') {
        if (
          !this.isMessageVisibleToParticipant(
            entry.message,
            input.participantId,
          )
        ) {
          continue;
        }

        visibleMessages.push(entry.message);
        visibleEntries.push({
          ...deepClone(entry),
          sortAt: Date.parse(entry.createdAt),
          isMuted:
            activeManualCutoffIndex !== null && index < activeManualCutoffIndex,
        });
        continue;
      }

      if (entry.kind === 'technical-event') {
        if (
          !filters.showTechnicalEvents ||
          !this.shouldShowTechnicalEvent(entry.event)
        ) {
          continue;
        }

        visibleEntries.push({
          ...deepClone(entry),
          sortAt: Date.parse(entry.createdAt),
        });
        continue;
      }

      if (entry.cutoff.source !== 'manual') {
        continue;
      }

      visibleEntries.push({
        ...deepClone(entry),
        sortAt: Date.parse(entry.createdAt),
      });
    }

    if (filters.showPreviewCutoffs) {
      for (const cutoff of this.getAgentContextCutoffs(tab.id)) {
        const sortAt = this.resolveCutoffSortTime(
          cutoff.anchor,
          visibleMessages,
        );
        visibleEntries.push({
          id: `preview-cutoff-${tab.id}-${cutoff.anchor.kind}-${cutoff.anchor.messageId ?? 'none'}-${cutoff.agentIds.join(',')}`,
          createdAt: new Date(sortAt).toISOString(),
          kind: 'history-cutoff',
          cutoff: {
            source: 'preview',
            label: this.formatPreviewCutoffLabel(cutoff, tab),
            anchor: cutoff.anchor,
            agentIds: cutoff.agentIds,
            agentNames: cutoff.agentNames,
            usesGlobalWindow: cutoff.usesGlobalWindow,
          },
          sortAt,
        });
      }
    }

    return visibleEntries.sort(compareVisibleTimelineEntries);
  }

  async sendMessage(
    input: SendMessageInput,
    tabId = this.workspace.activeTabId,
  ): Promise<ChatMessage> {
    const tab = this.requireTab(tabId);
    if (input.target === 'private' && !input.recipientId) {
      throw new Error('Private message requires recipientId');
    }

    const triggersSweep = input.triggerSweep ?? true;
    const createdInSweep =
      input.createdInSweep ??
      (triggersSweep ? tab.execution.sweepCount + 1 : undefined);

    const message: ChatMessage = {
      id: this.createId(),
      senderId: input.senderId,
      target: input.target,
      recipientId: input.recipientId,
      content: input.content.trim(),
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
    this.updateMessageSourceTrace(message.id, input.sourceTraceId, tab);
    this.pushDebugLog(
      {
        kind: 'message-created',
        sweep: message.createdInSweep,
        messageId: message.id,
        agentId: input.senderId,
        agentName: this.participantName(input.senderId, tab),
        target: message.target,
        recipientId: message.recipientId,
        content: message.content,
        details: triggersSweep
          ? 'message triggers sweep'
          : 'message does not trigger sweep',
      },
      tab,
    );
    this.persistAndNotify();

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
    this.syncParticipants(tab);
    this.pushDebugLog(
      {
        kind: 'agent-created',
        agentId: agent.id,
        agentName: agent.name,
        details: `model=${agent.modelId}`,
      },
      tab,
    );
    this.persistAndNotify();
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
    this.syncParticipants(tab);
    this.pushDebugLog(
      {
        kind: 'agent-updated',
        agentId: agent.id,
        agentName: agent.name,
        details: Object.keys(patch).join(', ') || 'no fields changed',
      },
      tab,
    );
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
    this.syncParticipants(tab);
    this.pushDebugLog(
      {
        kind: 'agent-removed',
        agentId: agent.id,
        agentName: agent.name,
        details: 'agent hidden and disabled',
      },
      tab,
    );
    this.persistAndNotify();
  }

  updateSettings(patch: Partial<RuntimeState['settings']>): void {
    this.workspace.settings = {
      ...this.workspace.settings,
      ...patch,
    };
    this.pushDebugLog(
      {
        kind: 'settings-updated',
        details: JSON.stringify(patch),
      },
      this.requireActiveTab(),
    );
    this.persistAndNotify();
  }

  updateDraftMessage(
    draftMessage: string,
    tabId = this.workspace.activeTabId,
  ): void {
    const tab = this.requireTab(tabId);
    if (tab.draftMessage === draftMessage) {
      return;
    }

    tab.draftMessage = draftMessage;
    this.persistAndNotify();
  }

  resetAgentHistoryContext(tabId = this.workspace.activeTabId): void {
    const tab = this.requireTab(tabId);
    const cutoff = this.createManualCutoffEntry();
    tab.timeline.push(cutoff);
    this.pushDebugLog(
      {
        kind: 'history-cutoff-set',
        messageId: this.getTimelineMessages(tab).at(-1)?.id,
        details: `cutoff=${cutoff.id}`,
      },
      tab,
    );
    this.persistAndNotify();
  }

  clearHistoryBeforeAgentCutoff(tabId = this.workspace.activeTabId): void {
    const tab = this.requireTab(tabId);
    const cutoffIndex = this.getActiveManualCutoffIndex(tab);
    if (cutoffIndex === null) {
      return;
    }

    const cutoff = tab.timeline[cutoffIndex];
    if (!cutoff) {
      return;
    }

    tab.timeline = tab.timeline.slice(cutoffIndex + 1);
    this.pushDebugLog(
      {
        kind: 'history-cleared',
        messageId: cutoff.id,
        details: `cleared through ${cutoff.id}`,
      },
      tab,
    );
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
    this.pushDebugLog(
      {
        kind: 'runtime-reset',
        details: 'runtime state reset',
      },
      this.requireActiveTab(),
    );
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

    this.syncParticipants(tab);
    this.pushDebugLog(
      {
        kind: 'human-updated',
        agentId: human.id,
        agentName: human.name,
        details: 'human participant updated',
      },
      tab,
    );
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
      title: this.resolveAutoTabTitle(input?.title),
      human,
    });
    this.workspace.tabs.push(tab);
    if (input?.activate ?? true) {
      this.workspace.activeTabId = tab.id;
    }
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
      normalizeTabTitle(title) || this.resolveAutoTabTitle(undefined, tabId);
    if (nextTitle === tab.title) {
      return;
    }

    tab.title = nextTitle;
    this.persistAndNotify();
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
    if (!maybeTab.execution.isSweepRunning && !this.abortControllers.has(tabId)) {
      return;
    }
    const tab = maybeTab;

    tab.execution.stopRequested = true;
    tab.execution.queuedSweep = false;
    this.abortControllers.get(tabId)?.abort();
    this.pushRuntimeEvent(
      {
        type: 'sweep-stopped',
        details: 'User requested stop',
      },
      tab,
    );
    this.pushDebugLog(
      {
        kind: 'sweep-stopped',
        sweep: tab.execution.sweepCount,
        details: 'User requested stop',
      },
      tab,
    );
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

    if (tab.execution.isSweepRunning) {
      if (!tab.execution.stopRequested) {
        tab.execution.queuedSweep = true;
      }
      this.persistAndNotify();
      return;
    }

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
      this.pushRuntimeEvent(
        {
          type: 'sweep-started',
          details: trigger,
        },
        currentTab,
      );
      this.pushDebugLog(
        {
          kind: 'sweep-started',
          sweep: currentTab.execution.sweepCount,
          trigger,
        },
        currentTab,
      );
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
      this.pushRuntimeEvent(
        {
          type: 'sweep-finished',
          details: trigger,
        },
        latestTab,
      );
      this.pushDebugLog(
        {
          kind: 'sweep-finished',
          sweep: latestTab.execution.sweepCount,
          trigger,
        },
        latestTab,
      );
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
  }

  private async runAgentTurn(agent: AgentConfig, tabId: string): Promise<void> {
    const tab = this.getTab(tabId);
    if (!tab) {
      return;
    }

    if (tab.execution.stopRequested) {
      this.pushDebugLog(
        {
          kind: 'turn-skipped',
          sweep: tab.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          skipReason: 'stop_requested',
        },
        tab,
      );
      return;
    }

    const visibleMessages = this.getVisibleMessagesForAgent(agent.id, tabId);
    if (!this.hasNewVisibleInputForAgent(agent.id, tab)) {
      this.pushDebugLog(
        {
          kind: 'turn-skipped',
          sweep: tab.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          skipReason: 'no_new_input',
          visibleMessageIds: visibleMessages.map((message) => message.id),
          nonSelfVisibleMessageIds: this.getNonSelfVisibleMessageIds(agent.id, tab),
          contextKeyPrev:
            this.lastProcessedKeysForTab(tab.id).get(agent.id) ?? '',
          contextKeyNext: this.getVisibleContextKey(agent.id, tab),
        },
        tab,
      );
      return;
    }

    const apiKey = this.workspace.settings.openRouterApiKey;
    if (!apiKey) {
      this.pushDebugLog(
        {
          kind: 'turn-skipped',
          sweep: tab.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          skipReason: 'no_api_key',
          visibleMessageIds: visibleMessages.map((message) => message.id),
          nonSelfVisibleMessageIds: this.getNonSelfVisibleMessageIds(agent.id, tab),
          contextKeyPrev:
            this.lastProcessedKeysForTab(tab.id).get(agent.id) ?? '',
          contextKeyNext: this.getVisibleContextKey(agent.id, tab),
        },
        tab,
      );
      this.pushRuntimeError(
        {
          agentId: agent.id,
          message: 'OpenRouter API key is missing',
        },
        tab,
      );
      return;
    }

    const mode = this.chooseAgentMode(agent);
    const abortController = new AbortController();
    this.abortControllers.set(tab.id, abortController);
    const previousContextKey =
      this.lastProcessedKeysForTab(tab.id).get(agent.id) ?? '';
    const nextContextKey = this.getVisibleContextKey(agent.id, tab);
    const nonSelfVisibleMessageIds = this.getNonSelfVisibleMessageIds(agent.id, tab);
    const triggeringMessageIds = this.getTriggeringMessageIds(
      previousContextKey,
      nonSelfVisibleMessageIds,
    );
    const trace = this.createRequestTrace(
      {
        agent,
        mode,
        fallback: false,
        parentTraceId: null,
        triggeringMessageIds,
        visibleMessageIds: visibleMessages.map((message) => message.id),
        nonSelfVisibleMessageIds,
      },
      tab,
    );
    this.pushDebugLog(
      {
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
      tab,
    );

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
      this.completeRequestTrace(
        trace.id,
        {
          status: 'succeeded',
          usage: result.usage,
          action: result.action,
        },
        tab,
      );

      if (result.action.type === 'stay_silent') {
        const requestCostUsd = result.usage?.estimatedCost;
        const ownPromptCostUsd = this.getPromptCostUsd(agent, result.usage);
        this.pushRuntimeEvent(
          {
            type: 'silent-decision',
            agentId: agent.id,
            details: result.action.reason,
            sourceTraceId: trace.id,
            requestCostUsd,
            ownPromptCostUsd,
            costUsd: requestCostUsd,
          },
          tab,
        );
        this.pushDebugLog(
          {
            kind: 'turn-result',
            sweep: tab.execution.sweepCount,
            agentId: agent.id,
            agentName: agent.name,
            mode: result.mode,
            fallback: false,
            actionType: result.action.type,
            details: result.action.reason,
          },
          tab,
        );
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
      this.attachProducedMessageToTrace(trace.id, sentMessage.id, tab);
      this.pushDebugLog(
        {
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
        tab,
      );
      tab.execution.queuedSweep = true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.completeRequestTrace(
          trace.id,
          {
            status: 'aborted',
            error: 'Agent request aborted',
          },
          tab,
        );
        this.pushRuntimeEvent(
          {
            type: 'sweep-stopped',
            agentId: agent.id,
            details: 'Agent request aborted',
          },
          tab,
        );
        this.pushDebugLog(
          {
            kind: 'sweep-stopped',
            sweep: tab.execution.sweepCount,
            agentId: agent.id,
            agentName: agent.name,
            details: 'Agent request aborted',
          },
          tab,
        );
        this.persistAndNotify();
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown agent runtime error';
      this.completeRequestTrace(
        trace.id,
        {
          status: 'failed',
          error: message,
        },
        tab,
      );
      this.pushRuntimeError(
        {
          agentId: agent.id,
          message: 'Agent turn failed',
          details: message,
          sourceTraceId: trace.id,
        },
        tab,
      );

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
          const fallbackTrace = this.createRequestTrace(
            {
              agent,
              mode: 'json',
              fallback: true,
              parentTraceId: trace.id,
              triggeringMessageIds,
              visibleMessageIds: visibleMessages.map((message) => message.id),
              nonSelfVisibleMessageIds,
            },
            tab,
          );
          this.pushDebugLog(
            {
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
            tab,
          );
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
          this.applyDownstreamPromptCost(agent, visibleMessages, fallback.usage, tab);
          this.completeRequestTrace(
            fallbackTrace.id,
            {
              status: 'succeeded',
              usage: fallback.usage,
              action: fallback.action,
            },
            tab,
          );
          if (fallback.action.type === 'stay_silent') {
            const requestCostUsd = fallback.usage?.estimatedCost;
            const ownPromptCostUsd = this.getPromptCostUsd(agent, fallback.usage);
            this.pushRuntimeEvent(
              {
                type: 'silent-decision',
                agentId: agent.id,
                details: fallback.action.reason,
                sourceTraceId: fallbackTrace.id,
                requestCostUsd,
                ownPromptCostUsd,
                costUsd: requestCostUsd,
              },
              tab,
            );
            this.pushDebugLog(
              {
                kind: 'turn-result',
                sweep: tab.execution.sweepCount,
                agentId: agent.id,
                agentName: agent.name,
                mode: 'json',
                fallback: true,
                actionType: fallback.action.type,
                details: fallback.action.reason,
              },
              tab,
            );
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
          this.attachProducedMessageToTrace(fallbackTrace.id, sentMessage.id, tab);
          this.pushDebugLog(
            {
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
            tab,
          );
          tab.execution.queuedSweep = true;
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : 'Unknown JSON fallback error';
          const fallbackTraceId =
            tab.requestTraces[trace.id]?.childTraceIds.at(-1) ?? null;
          if (fallbackTraceId) {
            this.completeRequestTrace(
              fallbackTraceId,
              {
                status:
                  fallbackError instanceof Error &&
                  fallbackError.name === 'AbortError'
                    ? 'aborted'
                    : 'failed',
                error: fallbackMessage,
              },
              tab,
            );
          }
          this.pushRuntimeError(
            {
              agentId: agent.id,
              message: 'JSON fallback failed',
              details: fallbackMessage,
              sourceTraceId: fallbackTraceId ?? undefined,
            },
            tab,
          );
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
      const entry = this.findMessageEntryById(visibleMessage.id, tab);
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
    const agent = tab.agents.find((item) => item.id === agentId);
    const contextWindowSize =
      agent?.contextWindowSize ??
      this.workspace.settings.defaultContextWindowSize ??
      this.maxContextMessages;
    const visibleMessages = this.getContextEligibleMessagesForAgent(agentId, tab);

    return visibleMessages.slice(-contextWindowSize).map((message) => {
      const sender = tab.participants.find(
        (participant) => participant.id === message.senderId,
      );
      const recipient = tab.participants.find(
        (participant) => participant.id === message.recipientId,
      );

      return {
        id: message.id,
        senderId: message.senderId,
        senderName: sender?.name ?? message.senderId,
        target: message.target,
        recipientId: message.recipientId,
        recipientName: recipient?.name,
        content: message.content,
        createdAt: message.createdAt,
      };
    });
  }

  getAgentContextCutoffs(tabId = this.workspace.activeTabId): AgentContextCutoff[] {
    const tab = this.requireTab(tabId);
    type GroupedCutoff = {
      anchor: ContextCutoffAnchor;
      agentIds: string[];
      agentNames: string[];
      usesGlobalWindowFlags: boolean[];
    };

    const groupedCutoffs = new Map<string, GroupedCutoff>();

    for (const agent of this.getActiveAgents(tab)) {
      const eligibleMessages = this.getContextEligibleMessagesForAgent(
        agent.id,
        tab,
      );
      const contextWindowSize =
        agent.contextWindowSize ??
        this.workspace.settings.defaultContextWindowSize ??
        this.maxContextMessages;
      const contextMessages = eligibleMessages.slice(-contextWindowSize);
      const anchor = contextMessages[0]
        ? {
            kind: 'before-message' as const,
            messageId: contextMessages[0].id,
          }
        : ({
            kind: this.getTimelineMessages(tab).length ? 'end' : 'start',
          } as const);
      const key = `${anchor.kind}:${anchor.messageId ?? ''}`;
      const current: GroupedCutoff = groupedCutoffs.get(key) ?? {
        anchor,
        agentIds: [],
        agentNames: [],
        usesGlobalWindowFlags: [],
      };

      current.agentIds.push(agent.id);
      current.agentNames.push(agent.name);
      current.usesGlobalWindowFlags.push(agent.contextWindowSize == null);
      groupedCutoffs.set(key, current);
    }

    return Array.from(groupedCutoffs.values()).map((group) => ({
      anchor: group.anchor,
      agentIds: group.agentIds,
      agentNames: group.agentNames,
      usesGlobalWindow: group.usesGlobalWindowFlags.every(Boolean),
    }));
  }

  isMessageVisibleToAgent(message: ChatMessage, agentId: string): boolean {
    if (message.target === 'public') {
      return true;
    }

    return message.senderId === agentId || message.recipientId === agentId;
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
      message.senderId === participantId ||
      message.recipientId === participantId
    );
  }

  private getContextEligibleMessagesForAgent(
    agentId: string,
    tab: ChatTabState,
  ): ChatMessage[] {
    return this.getTimelineMessages(tab).filter((message) => {
      if (!this.isMessageVisibleToAgent(message, agentId)) {
        return false;
      }

      const cutoffIndex = this.getActiveManualCutoffIndex(tab);
      if (cutoffIndex === null) {
        return true;
      }

      const entryIndex = tab.timeline.findIndex((entry) => entry.id === message.id);
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

    const previousIds = new Set((keys.get(agentId) ?? '').split('|').filter(Boolean));
    const nextIds = this.getNonSelfVisibleMessageIds(agentId, tab);
    return nextIds.some((messageId) => !previousIds.has(messageId));
  }

  private markVisibleContextProcessed(agentId: string, tab: ChatTabState): void {
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
    return nextVisibleMessageIds.filter((messageId) => !previousMessageIds.has(messageId));
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

  private createRequestTrace(
    input: {
      agent: AgentConfig;
      mode: AgentExecutionMode;
      fallback: boolean;
      parentTraceId: string | null;
      triggeringMessageIds: string[];
      visibleMessageIds: string[];
      nonSelfVisibleMessageIds: string[];
    },
    tab: ChatTabState,
  ): RequestTrace {
    const trace: RequestTrace = {
      id: this.createId(),
      sweep: tab.execution.sweepCount,
      agentId: input.agent.id,
      agentName: input.agent.name,
      mode: input.mode,
      fallback: input.fallback,
      status: 'running',
      startedAt: this.now().toISOString(),
      triggeringMessageIds: input.triggeringMessageIds,
      visibleMessageIds: input.visibleMessageIds,
      nonSelfVisibleMessageIds: input.nonSelfVisibleMessageIds,
      producedMessageId: undefined,
      parentTraceId: input.parentTraceId,
      childTraceIds: [],
      upstreamMessageIds: input.triggeringMessageIds,
      downstreamMessageIds: [],
      usage: undefined,
      pricingSnapshot: {
        prompt: input.agent.pricing?.prompt,
        completion: input.agent.pricing?.completion,
      },
      transport: undefined,
      payloads: {},
      links: [],
    };
    tab.requestTraces[trace.id] = trace;
    if (trace.parentTraceId) {
      tab.requestTraces[trace.parentTraceId]?.childTraceIds.push(trace.id);
      trace.links.push({ kind: 'parent', traceId: trace.parentTraceId });
    }
    for (const messageId of trace.triggeringMessageIds) {
      this.linkTraceToMessage(messageId, trace.id, 'triggering', tab);
      trace.links.push({ kind: 'triggering-message', messageId });
    }
    for (const messageId of trace.visibleMessageIds) {
      this.linkTraceToMessage(messageId, trace.id, 'visible', tab);
      trace.links.push({ kind: 'visible-message', messageId });
    }
    return trace;
  }

  private completeRequestTrace(
    traceId: string,
    input: {
      status: RequestTrace['status'];
      usage?: TransportUsage;
      action?: unknown;
      error?: string;
    },
    tab: ChatTabState,
  ): void {
    const trace = tab.requestTraces[traceId];
    if (!trace) {
      return;
    }

    trace.status = input.status;
    trace.finishedAt = this.now().toISOString();
    if (input.usage) {
      trace.usage = {
        promptTokens: input.usage.promptTokens,
        completionTokens: input.usage.completionTokens,
        totalTokens: input.usage.totalTokens,
        estimatedCost: input.usage.estimatedCost,
        promptCostUsd: this.getPromptCostUsd(
          tab.agents.find((agent) => agent.id === trace.agentId) ?? {
            id: trace.agentId,
            name: trace.agentName,
            modelId: '',
            systemPrompt: '',
            capabilities: {
              prefersTools: false,
              supportsToolUse: 'unknown',
            },
          },
          input.usage,
        ),
        requestCostUsd: input.usage.estimatedCost,
      };
      trace.payloads.requestInputJson = input.usage.requestPayloadJson;
      trace.payloads.responseOutputJson = input.usage.responsePayloadJson;
      trace.transport = {
        ...trace.transport,
        ...input.usage.transportMeta,
      };
    }
    if (input.action) {
      trace.payloads.normalizedActionJson = input.action;
    }
    if (input.error) {
      trace.transport = {
        ...trace.transport,
        error: input.error,
      };
    }
  }

  private attachProducedMessageToTrace(
    traceId: string,
    messageId: string,
    tab: ChatTabState,
  ): void {
    const trace = tab.requestTraces[traceId];
    if (!trace) {
      return;
    }

    trace.producedMessageId = messageId;
    trace.downstreamMessageIds.push(messageId);
    trace.links.push({ kind: 'produced-message', messageId });
    const index = this.getMessageInspectionIndexEntry(messageId, tab);
    index.sourceTraceId = traceId;
  }

  private updateMessageSourceTrace(
    messageId: string,
    traceId: string | undefined,
    tab: ChatTabState,
  ): void {
    if (!traceId) {
      return;
    }

    const index = this.getMessageInspectionIndexEntry(messageId, tab);
    index.sourceTraceId = traceId;
  }

  private getMessageInspectionIndexEntry(
    messageId: string,
    tab: ChatTabState,
  ): MessageInspectionIndex {
    tab.messageInspectionIndex[messageId] ??= {
      sourceTraceId: undefined,
      downstreamTraceIds: [],
      triggeringTraceIds: [],
      visibleTraceIds: [],
    };
    return tab.messageInspectionIndex[messageId]!;
  }

  private linkTraceToMessage(
    messageId: string,
    traceId: string,
    kind: 'triggering' | 'visible',
    tab: ChatTabState,
  ): void {
    const index = this.getMessageInspectionIndexEntry(messageId, tab);
    const target =
      kind === 'triggering' ? index.triggeringTraceIds : index.visibleTraceIds;
    if (!target.includes(traceId)) {
      target.push(traceId);
    }
    if (!index.downstreamTraceIds.includes(traceId)) {
      index.downstreamTraceIds.push(traceId);
    }
  }

  private cloneTraces(traceIds: string[], tab: ChatTabState): RequestTrace[] {
    return traceIds
      .map((traceId) => tab.requestTraces[traceId])
      .filter((item): item is RequestTrace => Boolean(item))
      .map((item) => deepClone(item));
  }

  private getMessageById(messageId: string, tab: ChatTabState): ChatMessage | null {
    return this.findMessageEntryById(messageId, tab)?.message ?? null;
  }

  private syncParticipants(tab: ChatTabState): void {
    const human =
      tab.participants.find((participant) => participant.role === 'human') ??
      deepClone(this.config.humanParticipant ?? DEFAULT_HUMAN);
    tab.participants = [
      human,
      ...tab.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: 'agent' as const,
      })),
    ];
  }

  private pushRuntimeEvent(
    input: Pick<
      RuntimeEvent,
      | 'type'
      | 'agentId'
      | 'details'
      | 'sourceTraceId'
      | 'costUsd'
      | 'requestCostUsd'
      | 'ownPromptCostUsd'
      | 'downstreamPromptCostUsd'
      | 'downstreamPromptCostContributors'
    >,
    tab: ChatTabState,
  ): void {
    const event: RuntimeEvent = {
      id: this.createId(),
      createdAt: this.now().toISOString(),
      ...input,
    };
    tab.timeline.push({
      id: event.id,
      createdAt: event.createdAt,
      kind: 'technical-event',
      event,
    });
  }

  private pushRuntimeError(
    input: Pick<
      RuntimeError,
      'agentId' | 'message' | 'details' | 'sourceTraceId'
    >,
    tab: ChatTabState,
  ): void {
    tab.errors.push({
      id: this.createId(),
      createdAt: this.now().toISOString(),
      ...input,
    });
    this.pushRuntimeEvent(
      {
        type: 'runtime-error',
        agentId: input.agentId,
        details: input.details ?? input.message,
        sourceTraceId: input.sourceTraceId,
      },
      tab,
    );
    this.pushDebugLog(
      {
        kind: 'runtime-error',
        sweep: tab.execution.sweepCount,
        agentId: input.agentId,
        agentName: input.agentId
          ? this.participantName(input.agentId, tab)
          : undefined,
        details: `${input.message}${input.details ? `: ${input.details}` : ''}`,
      },
      tab,
    );
  }

  private pushDebugLog(
    input: Omit<DebugLogEntry, 'id' | 'createdAt'>,
    tab: ChatTabState,
  ): void {
    tab.debugLogs.push({
      id: `debug-${tab.debugLogs.length + 1}`,
      createdAt: this.now().toISOString(),
      ...input,
    });
  }

  private getTimelineMessages(tab: ChatTabState): ChatMessage[] {
    return tab.timeline
      .filter(
        (entry): entry is TimelineMessageEntry => entry.kind === 'message',
      )
      .map((entry) => entry.message);
  }

  private findMessageEntryById(
    messageId: string,
    tab: ChatTabState,
  ): TimelineMessageEntry | undefined {
    return tab.timeline.find(
      (entry): entry is TimelineMessageEntry =>
        entry.kind === 'message' && entry.message.id === messageId,
    );
  }

  private getActiveManualCutoffIndex(tab: ChatTabState): number | null {
    for (let index = tab.timeline.length - 1; index >= 0; index -= 1) {
      const entry = tab.timeline[index];
      if (entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual') {
        return index;
      }
    }

    return null;
  }

  private createManualCutoffEntry(): TimelineHistoryCutoffEntry {
    const createdAt = this.now().toISOString();
    return {
      id: this.createId(),
      createdAt,
      kind: 'history-cutoff',
      cutoff: {
        source: 'manual',
      },
    };
  }

  private shouldShowTechnicalEvent(event: RuntimeEvent): boolean {
    return event.type === 'silent-decision' || event.type === 'runtime-error';
  }

  private formatPreviewCutoffLabel(
    cutoff: AgentContextCutoff,
    tab: ChatTabState,
  ): string {
    const activeAgentCount = this.getActiveAgents(tab).length;
    if (activeAgentCount > 0 && cutoff.agentIds.length === activeAgentCount) {
      return 'context for: all agents';
    }

    return `context for: ${cutoff.agentNames.join(', ')}`;
  }

  private resolveCutoffSortTime(
    anchor: ContextCutoffAnchor,
    messages: ChatMessage[],
  ): number {
    if (!messages.length) {
      return 0;
    }

    if (anchor.kind === 'start') {
      return Date.parse(messages[0].createdAt) - 0.5;
    }

    if (anchor.kind === 'end') {
      return Date.parse(messages.at(-1)!.createdAt) + 0.5;
    }

    const messageIndex = messages.findIndex(
      (message) => message.id === anchor.messageId,
    );
    if (messageIndex === -1) {
      return anchor.kind === 'after-message'
        ? Date.parse(messages.at(-1)!.createdAt) + 0.5
        : Date.parse(messages[0].createdAt) - 0.5;
    }

    const previousMessage =
      anchor.kind === 'after-message'
        ? messages[messageIndex]
        : messages[messageIndex - 1];
    const nextMessage =
      anchor.kind === 'after-message'
        ? messages[messageIndex + 1]
        : messages[messageIndex];
    const previousTime = previousMessage
      ? Date.parse(previousMessage.createdAt)
      : null;
    const nextTime = nextMessage ? Date.parse(nextMessage.createdAt) : null;

    if (previousTime !== null && nextTime !== null) {
      return previousTime === nextTime
        ? previousTime + 0.5
        : previousTime + (nextTime - previousTime) / 2;
    }

    if (previousTime !== null) {
      return previousTime + 0.5;
    }

    return (nextTime ?? 0) - 0.5;
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
      draftMessage: tab.draftMessage,
      participants: tab.participants,
      agents: tab.agents,
      timeline: tab.timeline,
      metrics: tab.metrics,
      settings: this.workspace.settings,
      debugLogs: tab.debugLogs,
      errors: tab.errors,
      execution: tab.execution,
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
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export function createMultiChatRuntime(
  config: RuntimeConfig,
): MultiChatRuntime {
  return new MultiChatRuntime(config);
}

function compareVisibleTimelineEntries(
  left: VisibleTimelineEntry,
  right: VisibleTimelineEntry,
): number {
  if (left.sortAt !== right.sortAt) {
    return left.sortAt - right.sortAt;
  }

  const priority = {
    'history-cutoff': 0,
    message: 1,
    'technical-event': 2,
  } as const;

  return priority[left.kind] - priority[right.kind];
}
