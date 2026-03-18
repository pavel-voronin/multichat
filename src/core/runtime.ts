import type {
  AgentConfig,
  AgentContextCutoff,
  AgentContextMessage,
  AgentExecutionMode,
  AgentMetrics,
  ChatMessage,
  ContextCutoffAnchor,
  DebugLogEntry,
  OpenRouterModel,
  RuntimeConfig,
  RuntimeError,
  RuntimeEvent,
  TimelineEntry,
  TimelineFilterState,
  TimelineHistoryCutoffEntry,
  TimelineMessageEntry,
  TimelineTechnicalEventEntry,
  VisibleTimelineEntry,
  TransportUsage,
  RuntimeState,
  SendMessageInput,
  RequestTrace,
  MessageInspectionIndex,
} from './types';
import { LocalStoragePersistenceAdapter } from './storage';
import { createId, deepClone } from './utils';

export type RuntimeListener = (state: RuntimeState) => void;

const DEFAULT_HUMAN = {
  id: 'human',
  name: 'Human',
  role: 'human',
} as const;

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

function initialState(config: RuntimeConfig): RuntimeState {
  const human = config.humanParticipant ?? DEFAULT_HUMAN;
  return {
    participants: [human],
    agents: [],
    timeline: [],
    metrics: {},
    settings: {
      openRouterApiKey: '',
      defaultContextWindowSize: config.maxContextMessages ?? 40,
      showContextCutoffs: false,
      showSilentDecisions: false,
      costDisplayMode: 'request',
    },
    debugLogs: [],
    errors: [],
    execution: {
      isSweepRunning: false,
      queuedSweep: false,
      sweepCount: 0,
      stopRequested: false,
    },
    requestTraces: {},
    messageInspectionIndex: {},
  };
}

function mergePersistedState(
  base: RuntimeState,
  persisted: Partial<RuntimeState> | null,
): RuntimeState {
  if (!persisted) {
    return base;
  }

  return {
    ...base,
    ...persisted,
    participants: persisted.participants?.length
      ? persisted.participants
      : base.participants,
    agents: (persisted.agents ?? []).map(normalizeAgentConfig),
    timeline: persisted.timeline ?? [],
    metrics: persisted.metrics ?? {},
    settings: {
      ...base.settings,
      ...persisted.settings,
    },
    debugLogs: persisted.debugLogs ?? [],
    errors: persisted.errors ?? [],
    execution: base.execution,
    requestTraces: persisted.requestTraces ?? {},
    messageInspectionIndex: persisted.messageInspectionIndex ?? {},
  };
}

export class MultiChatRuntime {
  private readonly listeners = new Set<RuntimeListener>();
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly maxAutoSweeps: number;
  private readonly maxContextMessages: number;
  private readonly storage;
  private readonly lastProcessedVisibleContextKeys = new Map<string, string>();
  private currentAbortController: AbortController | null = null;
  private state: RuntimeState;

  constructor(private readonly config: RuntimeConfig) {
    this.now = config.now ?? (() => new Date());
    this.createId = config.idGenerator ?? createId;
    this.maxAutoSweeps = config.maxAutoSweeps ?? 12;
    this.maxContextMessages = config.maxContextMessages ?? 40;
    this.storage = config.storage ?? new LocalStoragePersistenceAdapter();
    this.state = mergePersistedState(initialState(config), this.storage.load());
    this.syncParticipants();
    this.persist();
  }

  getState(): RuntimeState {
    return deepClone(this.state);
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async listModels(): Promise<OpenRouterModel[]> {
    const apiKey = this.state.settings.openRouterApiKey;
    if (!apiKey) {
      throw new Error('OpenRouter API key is missing');
    }

    return this.config.transport.listModels(apiKey);
  }

  getTimelineEntries(): TimelineEntry[] {
    return deepClone(this.state.timeline);
  }

  getRequestTrace(traceId: string): RequestTrace | null {
    return deepClone(this.state.requestTraces[traceId] ?? null);
  }

  getRelatedRequestTraces(traceId: string): RequestTrace[] {
    const trace = this.state.requestTraces[traceId];
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
      const index = this.state.messageInspectionIndex[messageId];
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
      .map((relatedTraceId) => this.state.requestTraces[relatedTraceId])
      .filter((item): item is RequestTrace => Boolean(item))
      .map((item) => deepClone(item));
  }

  getInspectionSubjectForMessage(messageId: string): {
    message: ChatMessage | null;
    sourceTrace: RequestTrace | null;
    triggeringTraces: RequestTrace[];
    visibleOnlyTraces: RequestTrace[];
    downstreamTraces: RequestTrace[];
  } {
    const message = this.getMessageById(messageId);
    const index = this.getMessageInspectionIndexEntry(messageId);
    const sourceTrace = index.sourceTraceId
      ? (this.state.requestTraces[index.sourceTraceId] ?? null)
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
      triggeringTraces: this.cloneTraces(index.triggeringTraceIds),
      visibleOnlyTraces: this.cloneTraces(visibleOnlyTraceIds),
      downstreamTraces: this.cloneTraces(downstreamTraceIds),
    };
  }

  getMessageInspectionGraph(messageId: string): {
    message: ChatMessage | null;
    sourceTrace: RequestTrace | null;
    triggeringTraces: RequestTrace[];
    visibleOnlyTraces: RequestTrace[];
    downstreamTraces: RequestTrace[];
    relatedMessages: ChatMessage[];
  } {
    const subject = this.getInspectionSubjectForMessage(messageId);
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
        .map((relatedMessageId) => this.getMessageById(relatedMessageId))
        .filter((item): item is ChatMessage => Boolean(item))
        .map((item) => deepClone(item)),
    };
  }

  getVisibleTimelineEntries(input: {
    participantId: string;
    filters?: Partial<TimelineFilterState>;
  }): VisibleTimelineEntry[] {
    const filters: TimelineFilterState = {
      showTechnicalEvents: false,
      showPreviewCutoffs: false,
      ...input.filters,
    };
    const activeManualCutoffIndex = this.getActiveManualCutoffIndex();
    const visibleEntries: VisibleTimelineEntry[] = [];
    const visibleMessages: ChatMessage[] = [];

    for (const [index, entry] of this.state.timeline.entries()) {
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
      for (const cutoff of this.getAgentContextCutoffs()) {
        const sortAt = this.resolveCutoffSortTime(
          cutoff.anchor,
          visibleMessages,
        );
        visibleEntries.push({
          id: `preview-cutoff-${cutoff.anchor.kind}-${cutoff.anchor.messageId ?? 'none'}-${cutoff.agentIds.join(',')}`,
          createdAt: new Date(sortAt).toISOString(),
          kind: 'history-cutoff',
          cutoff: {
            source: 'preview',
            label: this.formatPreviewCutoffLabel(cutoff),
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

  async sendMessage(input: SendMessageInput): Promise<ChatMessage> {
    if (input.target === 'private' && !input.recipientId) {
      throw new Error('Private message requires recipientId');
    }

    const triggersSweep = input.triggerSweep ?? true;
    const createdInSweep =
      input.createdInSweep ??
      (triggersSweep ? this.state.execution.sweepCount + 1 : undefined);

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

    this.state.timeline.push({
      id: message.id,
      createdAt: message.createdAt,
      kind: 'message',
      message,
    });
    this.updateMessageSourceTrace(message.id, input.sourceTraceId);
    this.pushDebugLog({
      kind: 'message-created',
      sweep: message.createdInSweep,
      messageId: message.id,
      agentId: input.senderId,
      agentName: this.participantName(input.senderId),
      target: message.target,
      recipientId: message.recipientId,
      content: message.content,
      details: triggersSweep
        ? 'message triggers sweep'
        : 'message does not trigger sweep',
    });
    this.persistAndNotify();

    if (triggersSweep) {
      await this.runAgentSweep('message');
    }

    return message;
  }

  createAgent(input: Omit<AgentConfig, 'id'> & { id?: string }): AgentConfig {
    const agent: AgentConfig = {
      ...input,
      id: input.id ?? this.createId(),
      isEnabled: input.isEnabled ?? true,
      isHidden: input.isHidden ?? false,
      archivedAt: input.archivedAt ?? null,
    };

    this.state.agents.push(agent);
    this.state.metrics[agent.id] =
      this.state.metrics[agent.id] ?? emptyMetrics();
    this.syncParticipants();
    this.pushDebugLog({
      kind: 'agent-created',
      agentId: agent.id,
      agentName: agent.name,
      details: `model=${agent.modelId}`,
    });
    this.persistAndNotify();
    return deepClone(agent);
  }

  updateAgent(
    agentId: string,
    patch: Partial<Omit<AgentConfig, 'id'>>,
  ): AgentConfig {
    const agent = this.state.agents.find((item) => item.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    Object.assign(agent, patch);
    this.syncParticipants();
    this.pushDebugLog({
      kind: 'agent-updated',
      agentId: agent.id,
      agentName: agent.name,
      details: Object.keys(patch).join(', ') || 'no fields changed',
    });
    this.persistAndNotify();
    return deepClone(agent);
  }

  removeAgent(agentId: string): void {
    const agent = this.state.agents.find((item) => item.id === agentId);
    if (!agent) {
      return;
    }

    agent.isEnabled = false;
    agent.isHidden = true;
    agent.archivedAt = this.now().toISOString();
    this.lastProcessedVisibleContextKeys.delete(agentId);
    this.syncParticipants();
    this.pushDebugLog({
      kind: 'agent-removed',
      agentId: agent.id,
      agentName: agent.name,
      details: 'agent hidden and disabled',
    });
    this.persistAndNotify();
  }

  updateSettings(patch: Partial<RuntimeState['settings']>): void {
    this.state.settings = {
      ...this.state.settings,
      ...patch,
    };
    this.pushDebugLog({
      kind: 'settings-updated',
      details: JSON.stringify(patch),
    });
    this.persistAndNotify();
  }

  resetAgentHistoryContext(): void {
    const cutoff = this.createManualCutoffEntry();
    this.state.timeline.push(cutoff);
    this.pushDebugLog({
      kind: 'history-cutoff-set',
      messageId: this.getTimelineMessages().at(-1)?.id,
      details: `cutoff=${cutoff.id}`,
    });
    this.persistAndNotify();
  }

  clearHistoryBeforeAgentCutoff(): void {
    const cutoffIndex = this.getActiveManualCutoffIndex();
    if (cutoffIndex === null) {
      return;
    }

    const cutoff = this.state.timeline[cutoffIndex];
    if (!cutoff) {
      return;
    }

    this.state.timeline = this.state.timeline.slice(cutoffIndex + 1);
    this.pushDebugLog({
      kind: 'history-cleared',
      messageId: cutoff.id,
      details: `cleared through ${cutoff.id}`,
    });
    this.persistAndNotify();
  }

  reset(): void {
    this.stop();
    this.storage.reset();
    this.state = initialState(this.config);
    this.lastProcessedVisibleContextKeys.clear();
    this.pushDebugLog({
      kind: 'runtime-reset',
      details: 'runtime state reset',
    });
    this.persistAndNotify();
  }

  updateHumanParticipant(
    patch: Partial<Pick<RuntimeState['participants'][number], 'name'>>,
  ): void {
    const human = this.state.participants.find(
      (participant) => participant.role === 'human',
    );
    if (!human) {
      return;
    }

    if (typeof patch.name === 'string' && patch.name.trim()) {
      human.name = patch.name.trim();
    }

    this.syncParticipants();
    this.pushDebugLog({
      kind: 'human-updated',
      agentId: human.id,
      agentName: human.name,
      details: 'human participant updated',
    });
    this.persistAndNotify();
  }

  stop(): void {
    this.state.execution.stopRequested = true;
    this.state.execution.queuedSweep = false;
    this.currentAbortController?.abort();
    this.pushRuntimeEvent({
      type: 'sweep-stopped',
      details: 'User requested stop',
    });
    this.pushDebugLog({
      kind: 'sweep-stopped',
      sweep: this.state.execution.sweepCount,
      details: 'User requested stop',
    });
    this.persistAndNotify();
  }

  async runAgentSweep(trigger: string): Promise<void> {
    if (this.state.execution.isSweepRunning) {
      if (!this.state.execution.stopRequested) {
        this.state.execution.queuedSweep = true;
      }
      this.persistAndNotify();
      return;
    }

    if (trigger === 'manual') {
      this.lastProcessedVisibleContextKeys.clear();
    }

    let loops = 0;
    this.state.execution.stopRequested = false;

    do {
      if (this.state.execution.stopRequested) {
        break;
      }

      this.state.execution.isSweepRunning = true;
      this.state.execution.queuedSweep = false;
      this.state.execution.sweepCount += 1;
      this.pushRuntimeEvent({
        type: 'sweep-started',
        details: trigger,
      });
      this.pushDebugLog({
        kind: 'sweep-started',
        sweep: this.state.execution.sweepCount,
        trigger,
      });
      this.persistAndNotify();

      for (const agent of this.getActiveAgents()) {
        if (this.state.execution.stopRequested) {
          break;
        }
        await this.runAgentTurn(agent);
      }

      this.state.execution.isSweepRunning = false;
      this.pushRuntimeEvent({
        type: 'sweep-finished',
        details: trigger,
      });
      this.pushDebugLog({
        kind: 'sweep-finished',
        sweep: this.state.execution.sweepCount,
        trigger,
      });
      this.persistAndNotify();
      loops += 1;
    } while (
      this.state.execution.queuedSweep &&
      loops < this.maxAutoSweeps &&
      !this.state.execution.stopRequested
    );

    this.state.execution.isSweepRunning = false;
    this.state.execution.queuedSweep = false;
    this.currentAbortController = null;
    this.persistAndNotify();
  }

  private async runAgentTurn(agent: AgentConfig): Promise<void> {
    if (this.state.execution.stopRequested) {
      this.pushDebugLog({
        kind: 'turn-skipped',
        sweep: this.state.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        skipReason: 'stop_requested',
      });
      return;
    }

    const visibleMessages = this.getVisibleMessagesForAgent(agent.id);
    if (!this.hasNewVisibleInputForAgent(agent.id)) {
      this.pushDebugLog({
        kind: 'turn-skipped',
        sweep: this.state.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        skipReason: 'no_new_input',
        visibleMessageIds: visibleMessages.map((message) => message.id),
        nonSelfVisibleMessageIds: this.getNonSelfVisibleMessageIds(agent.id),
        contextKeyPrev:
          this.lastProcessedVisibleContextKeys.get(agent.id) ?? '',
        contextKeyNext: this.getVisibleContextKey(agent.id),
      });
      return;
    }

    const apiKey = this.state.settings.openRouterApiKey;
    if (!apiKey) {
      this.pushDebugLog({
        kind: 'turn-skipped',
        sweep: this.state.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        skipReason: 'no_api_key',
        visibleMessageIds: visibleMessages.map((message) => message.id),
        nonSelfVisibleMessageIds: this.getNonSelfVisibleMessageIds(agent.id),
        contextKeyPrev:
          this.lastProcessedVisibleContextKeys.get(agent.id) ?? '',
        contextKeyNext: this.getVisibleContextKey(agent.id),
      });
      this.pushRuntimeError({
        agentId: agent.id,
        message: 'OpenRouter API key is missing',
      });
      return;
    }

    const mode = this.chooseAgentMode(agent);
    this.currentAbortController = new AbortController();
    const previousContextKey =
      this.lastProcessedVisibleContextKeys.get(agent.id) ?? '';
    const nextContextKey = this.getVisibleContextKey(agent.id);
    const nonSelfVisibleMessageIds = this.getNonSelfVisibleMessageIds(agent.id);
    const triggeringMessageIds = this.getTriggeringMessageIds(
      previousContextKey,
      nonSelfVisibleMessageIds,
    );
    const trace = this.createRequestTrace({
      agent,
      mode,
      fallback: false,
      parentTraceId: null,
      triggeringMessageIds,
      visibleMessageIds: visibleMessages.map((message) => message.id),
      nonSelfVisibleMessageIds,
    });
    this.pushDebugLog({
      kind: 'turn-requested',
      sweep: this.state.execution.sweepCount,
      agentId: agent.id,
      agentName: agent.name,
      mode,
      fallback: false,
      visibleMessageIds: visibleMessages.map((message) => message.id),
      nonSelfVisibleMessageIds,
      triggeringMessageIds,
      contextKeyPrev: previousContextKey,
      contextKeyNext: nextContextKey,
    });

    try {
      const result = await this.config.transport.runAgentTurn({
        apiKey,
        context: {
          agent,
          participants: deepClone(this.state.participants),
          visibleMessages,
        },
        mode,
        signal: this.currentAbortController.signal,
      });

      this.markVisibleContextProcessed(agent.id);
      this.applyUsage(agent.id, result.usage);
      this.applyDownstreamPromptCost(agent, visibleMessages, result.usage);
      this.updateToolSupport(agent.id, result.mode);
      this.completeRequestTrace(trace.id, {
        status: 'succeeded',
        usage: result.usage,
        action: result.action,
      });

      if (result.action.type === 'stay_silent') {
        const requestCostUsd = result.usage?.estimatedCost;
        const ownPromptCostUsd = this.getPromptCostUsd(agent, result.usage);
        this.pushRuntimeEvent({
          type: 'silent-decision',
          agentId: agent.id,
          details: result.action.reason,
          sourceTraceId: trace.id,
          requestCostUsd,
          ownPromptCostUsd,
          costUsd: requestCostUsd,
        });
        this.pushDebugLog({
          kind: 'turn-result',
          sweep: this.state.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          mode: result.mode,
          fallback: false,
          actionType: result.action.type,
          details: result.action.reason,
        });
        this.persistAndNotify();
        return;
      }

      if (result.action.type === 'speak_public') {
        const sentMessage = await this.sendMessage({
          senderId: agent.id,
          content: result.action.text,
          target: 'public',
          requestCostUsd: result.usage?.estimatedCost,
          ownPromptCostUsd: this.getPromptCostUsd(agent, result.usage),
          createdInSweep: this.state.execution.sweepCount,
          sourceTraceId: trace.id,
          triggerSweep: false,
        });
        this.attachProducedMessageToTrace(trace.id, sentMessage.id);
        this.pushDebugLog({
          kind: 'turn-result',
          sweep: this.state.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          mode: result.mode,
          fallback: false,
          actionType: result.action.type,
          messageId: sentMessage.id,
          target: sentMessage.target,
          content: result.action.text,
        });
        this.state.execution.queuedSweep = true;
        return;
      }

      const sentMessage = await this.sendMessage({
        senderId: agent.id,
        content: result.action.text,
        target: 'private',
        recipientId: result.action.to,
        requestCostUsd: result.usage?.estimatedCost,
        ownPromptCostUsd: this.getPromptCostUsd(agent, result.usage),
        createdInSweep: this.state.execution.sweepCount,
        sourceTraceId: trace.id,
        triggerSweep: false,
      });
      this.attachProducedMessageToTrace(trace.id, sentMessage.id);
      this.pushDebugLog({
        kind: 'turn-result',
        sweep: this.state.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        mode: result.mode,
        fallback: false,
        actionType: result.action.type,
        messageId: sentMessage.id,
        target: sentMessage.target,
        recipientId: sentMessage.recipientId,
        content: result.action.text,
      });
      this.state.execution.queuedSweep = true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.completeRequestTrace(trace.id, {
          status: 'aborted',
          error: 'Agent request aborted',
        });
        this.pushRuntimeEvent({
          type: 'sweep-stopped',
          agentId: agent.id,
          details: 'Agent request aborted',
        });
        this.pushDebugLog({
          kind: 'sweep-stopped',
          sweep: this.state.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          details: 'Agent request aborted',
        });
        this.persistAndNotify();
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown agent runtime error';
      this.completeRequestTrace(trace.id, {
        status: 'failed',
        error: message,
      });
      this.pushRuntimeError({
        agentId: agent.id,
        message: 'Agent turn failed',
        details: message,
        sourceTraceId: trace.id,
      });

      if (mode === 'tools') {
        this.updateAgent(agent.id, {
          capabilities: {
            ...agent.capabilities,
            supportsToolUse: 'unsupported',
          },
        });

        try {
          const fallbackTrace = this.createRequestTrace({
            agent,
            mode: 'json',
            fallback: true,
            parentTraceId: trace.id,
            triggeringMessageIds,
            visibleMessageIds: visibleMessages.map((message) => message.id),
            nonSelfVisibleMessageIds,
          });
          this.pushDebugLog({
            kind: 'turn-requested',
            sweep: this.state.execution.sweepCount,
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
              participants: deepClone(this.state.participants),
              visibleMessages,
            },
            mode: 'json',
            signal: this.currentAbortController.signal,
          });

          this.markVisibleContextProcessed(agent.id);
          this.applyUsage(agent.id, fallback.usage);
          this.applyDownstreamPromptCost(
            agent,
            visibleMessages,
            fallback.usage,
          );
          this.completeRequestTrace(fallbackTrace.id, {
            status: 'succeeded',
            usage: fallback.usage,
            action: fallback.action,
          });
          if (fallback.action.type === 'stay_silent') {
            const requestCostUsd = fallback.usage?.estimatedCost;
            const ownPromptCostUsd = this.getPromptCostUsd(
              agent,
              fallback.usage,
            );
            this.pushRuntimeEvent({
              type: 'silent-decision',
              agentId: agent.id,
              details: fallback.action.reason,
              sourceTraceId: fallbackTrace.id,
              requestCostUsd,
              ownPromptCostUsd,
              costUsd: requestCostUsd,
            });
            this.pushDebugLog({
              kind: 'turn-result',
              sweep: this.state.execution.sweepCount,
              agentId: agent.id,
              agentName: agent.name,
              mode: 'json',
              fallback: true,
              actionType: fallback.action.type,
              details: fallback.action.reason,
            });
            this.persistAndNotify();
            return;
          }

          const sentMessage = await this.sendMessage({
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
            createdInSweep: this.state.execution.sweepCount,
            sourceTraceId: fallbackTrace.id,
            triggerSweep: false,
          });
          this.attachProducedMessageToTrace(fallbackTrace.id, sentMessage.id);
          this.pushDebugLog({
            kind: 'turn-result',
            sweep: this.state.execution.sweepCount,
            agentId: agent.id,
            agentName: agent.name,
            mode: 'json',
            fallback: true,
            actionType: fallback.action.type,
            messageId: sentMessage.id,
            target: sentMessage.target,
            recipientId: sentMessage.recipientId,
            content: fallback.action.text,
          });
          this.state.execution.queuedSweep = true;
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : 'Unknown JSON fallback error';
          const fallbackTraceId =
            this.state.requestTraces[trace.id]?.childTraceIds.at(-1) ?? null;
          if (fallbackTraceId) {
            this.completeRequestTrace(fallbackTraceId, {
              status:
                fallbackError instanceof Error &&
                fallbackError.name === 'AbortError'
                  ? 'aborted'
                  : 'failed',
              error: fallbackMessage,
            });
          }
          this.pushRuntimeError({
            agentId: agent.id,
            message: 'JSON fallback failed',
            details: fallbackMessage,
            sourceTraceId: fallbackTraceId ?? undefined,
          });
          this.persistAndNotify();
        }
      } else {
        this.persistAndNotify();
      }
    } finally {
      this.currentAbortController = null;
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

  private updateToolSupport(agentId: string, mode: AgentExecutionMode): void {
    if (mode !== 'tools') {
      return;
    }

    const agent = this.state.agents.find((item) => item.id === agentId);
    if (!agent) {
      return;
    }

    agent.capabilities.supportsToolUse = 'supported';
  }

  private applyDownstreamPromptCost(
    receivingAgent: AgentConfig,
    visibleMessages: AgentContextMessage[],
    usage?: TransportUsage,
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
      const entry = this.findMessageEntryById(visibleMessage.id);
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

  getVisibleMessagesForAgent(agentId: string): AgentContextMessage[] {
    const agent = this.state.agents.find((item) => item.id === agentId);
    const contextWindowSize =
      agent?.contextWindowSize ??
      this.state.settings.defaultContextWindowSize ??
      this.maxContextMessages;
    const visibleMessages = this.getContextEligibleMessagesForAgent(agentId);

    return visibleMessages.slice(-contextWindowSize).map((message) => {
      const sender = this.state.participants.find(
        (participant) => participant.id === message.senderId,
      );
      const recipient = this.state.participants.find(
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

  getAgentContextCutoffs(): AgentContextCutoff[] {
    type GroupedCutoff = {
      anchor: ContextCutoffAnchor;
      agentIds: string[];
      agentNames: string[];
      usesGlobalWindowFlags: boolean[];
    };

    const groupedCutoffs = new Map<string, GroupedCutoff>();

    for (const agent of this.getActiveAgents()) {
      const eligibleMessages = this.getContextEligibleMessagesForAgent(
        agent.id,
      );
      const contextWindowSize =
        agent.contextWindowSize ??
        this.state.settings.defaultContextWindowSize ??
        this.maxContextMessages;
      const contextMessages = eligibleMessages.slice(-contextWindowSize);
      const anchor = contextMessages[0]
        ? {
            kind: 'before-message' as const,
            messageId: contextMessages[0].id,
          }
        : ({
            kind: this.getTimelineMessages().length ? 'end' : 'start',
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

  private getContextEligibleMessagesForAgent(agentId: string): ChatMessage[] {
    return this.getTimelineMessages().filter((message) => {
      if (!this.isMessageVisibleToAgent(message, agentId)) {
        return false;
      }

      return this.isMessageAfterCutoff(message);
    });
  }

  private hasNewVisibleInputForAgent(agentId: string): boolean {
    const currentKey = this.getVisibleContextKey(agentId);
    return this.lastProcessedVisibleContextKeys.get(agentId) !== currentKey;
  }

  private markVisibleContextProcessed(agentId: string): void {
    this.lastProcessedVisibleContextKeys.set(
      agentId,
      this.getVisibleContextKey(agentId),
    );
  }

  private getVisibleContextKey(agentId: string): string {
    return this.getNonSelfVisibleMessageIds(agentId).join('|');
  }

  private getNonSelfVisibleMessageIds(agentId: string): string[] {
    const agent = this.state.agents.find((item) => item.id === agentId);
    const contextWindowSize =
      agent?.contextWindowSize ??
      this.state.settings.defaultContextWindowSize ??
      this.maxContextMessages;

    return this.getContextEligibleMessagesForAgent(agentId)
      .filter((message) => message.senderId !== agentId)
      .slice(-contextWindowSize)
      .map((message) => message.id);
  }

  private getTriggeringMessageIds(
    previousContextKey: string,
    nonSelfVisibleMessageIds: string[],
  ): string[] {
    const previousIds = new Set(
      previousContextKey ? previousContextKey.split('|').filter(Boolean) : [],
    );
    return nonSelfVisibleMessageIds.filter((id) => !previousIds.has(id));
  }

  private isMessageAfterCutoff(message: ChatMessage): boolean {
    const cutoffIndex = this.getActiveManualCutoffIndex();
    if (cutoffIndex === null) {
      return true;
    }
    const messageIndex = this.state.timeline.findIndex(
      (item) => item.kind === 'message' && item.message.id === message.id,
    );
    if (messageIndex === -1) {
      return true;
    }

    return messageIndex > cutoffIndex;
  }

  private applyUsage(
    agentId: string,
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      estimatedCost?: number;
    },
  ): void {
    const metrics = this.state.metrics[agentId] ?? emptyMetrics();
    metrics.requestCount += 1;
    metrics.promptTokens += usage?.promptTokens ?? 0;
    metrics.completionTokens += usage?.completionTokens ?? 0;
    metrics.totalTokens += usage?.totalTokens ?? 0;
    metrics.estimatedCost += usage?.estimatedCost ?? 0;
    this.state.metrics[agentId] = metrics;
  }

  private createRequestTrace(input: {
    agent: AgentConfig;
    mode: AgentExecutionMode;
    fallback: boolean;
    parentTraceId: string | null;
    triggeringMessageIds: string[];
    visibleMessageIds: string[];
    nonSelfVisibleMessageIds: string[];
  }): RequestTrace {
    const trace: RequestTrace = {
      id: this.createId(),
      sweep: this.state.execution.sweepCount,
      agentId: input.agent.id,
      agentName: input.agent.name,
      mode: input.mode,
      fallback: input.fallback,
      status: 'running',
      startedAt: this.now().toISOString(),
      triggeringMessageIds: [...input.triggeringMessageIds],
      visibleMessageIds: [...input.visibleMessageIds],
      nonSelfVisibleMessageIds: [...input.nonSelfVisibleMessageIds],
      parentTraceId: input.parentTraceId,
      childTraceIds: [],
      upstreamMessageIds: [...input.triggeringMessageIds],
      downstreamMessageIds: [],
      pricingSnapshot: input.agent.pricing
        ? { ...input.agent.pricing }
        : undefined,
      transport: {
        provider: 'openrouter',
        modelId: input.agent.modelId,
        executionMode: input.mode,
      },
      payloads: {},
      links: [
        ...input.triggeringMessageIds.map((messageId) => ({
          kind: 'triggering-message' as const,
          messageId,
        })),
        ...input.visibleMessageIds.map((messageId) => ({
          kind: 'visible-message' as const,
          messageId,
        })),
        ...(input.parentTraceId
          ? [{ kind: 'parent' as const, traceId: input.parentTraceId }]
          : []),
      ],
    };

    this.state.requestTraces[trace.id] = trace;
    if (input.parentTraceId) {
      const parentTrace = this.state.requestTraces[input.parentTraceId];
      if (parentTrace && !parentTrace.childTraceIds.includes(trace.id)) {
        parentTrace.childTraceIds.push(trace.id);
        parentTrace.links.push({
          kind: 'child',
          traceId: trace.id,
        });
      }
    }
    this.registerTraceForMessages(trace.id, input.triggeringMessageIds, true);
    this.registerTraceForMessages(trace.id, input.visibleMessageIds, false);

    return trace;
  }

  private completeRequestTrace(
    traceId: string,
    input: {
      status: RequestTrace['status'];
      usage?: TransportUsage;
      action?: {
        type: 'speak_public' | 'send_private' | 'stay_silent';
        text?: string;
        to?: string;
        reason?: string;
      };
      error?: string;
    },
  ): void {
    const trace = this.state.requestTraces[traceId];
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
        promptCostUsd: this.getPromptCostUsdByTrace(trace, input.usage),
        requestCostUsd: input.usage.estimatedCost,
      };
      trace.payloads.requestInputJson = input.usage.requestPayloadJson;
      trace.payloads.responseOutputJson = input.usage.responsePayloadJson;
      trace.transport = {
        ...trace.transport,
        ...(input.usage.transportMeta ?? {}),
      };
    }
    if (input.action) {
      trace.payloads.normalizedActionJson = deepClone(input.action);
    }
    if (input.error) {
      trace.transport = {
        ...trace.transport,
        error: input.error,
        aborted: input.status === 'aborted',
      };
    }
  }

  private attachProducedMessageToTrace(
    traceId: string,
    messageId: string,
  ): void {
    const trace = this.state.requestTraces[traceId];
    if (!trace) {
      return;
    }

    trace.producedMessageId = messageId;
    if (!trace.downstreamMessageIds.includes(messageId)) {
      trace.downstreamMessageIds.push(messageId);
    }
    trace.links.push({
      kind: 'produced-message',
      messageId,
    });
    this.updateMessageSourceTrace(messageId, traceId);
  }

  private updateMessageSourceTrace(
    messageId: string,
    sourceTraceId?: string,
  ): void {
    const index = this.getMessageInspectionIndexEntry(messageId);
    index.sourceTraceId = sourceTraceId;
    this.state.messageInspectionIndex[messageId] = index;
  }

  private registerTraceForMessages(
    traceId: string,
    messageIds: string[],
    isTriggering: boolean,
  ): void {
    for (const messageId of messageIds) {
      const index = this.getMessageInspectionIndexEntry(messageId);
      const targetIds = isTriggering
        ? index.triggeringTraceIds
        : index.visibleTraceIds;
      if (!targetIds.includes(traceId)) {
        targetIds.push(traceId);
      }
      if (!index.downstreamTraceIds.includes(traceId)) {
        index.downstreamTraceIds.push(traceId);
      }
      this.state.messageInspectionIndex[messageId] = index;
    }
  }

  private getMessageInspectionIndexEntry(
    messageId: string,
  ): MessageInspectionIndex {
    return (
      this.state.messageInspectionIndex[messageId] ?? {
        downstreamTraceIds: [],
        triggeringTraceIds: [],
        visibleTraceIds: [],
      }
    );
  }

  private cloneTraces(traceIds: string[]): RequestTrace[] {
    return traceIds
      .map((traceId) => this.state.requestTraces[traceId])
      .filter((item): item is RequestTrace => Boolean(item))
      .map((item) => deepClone(item));
  }

  private getMessageById(messageId: string): ChatMessage | null {
    return this.findMessageEntryById(messageId)?.message ?? null;
  }

  private getPromptCostUsdByTrace(
    trace: RequestTrace,
    usage?: TransportUsage,
  ): number {
    const agent = this.state.agents.find((item) => item.id === trace.agentId);
    if (!agent) {
      return 0;
    }

    return this.getPromptCostUsd(agent, usage);
  }

  private getActiveAgents(): AgentConfig[] {
    return this.state.agents.filter(
      (agent) => agent.isEnabled !== false && agent.isHidden !== true,
    );
  }

  private syncParticipants(): void {
    const human =
      this.state.participants.find(
        (participant) => participant.role === 'human',
      ) ??
      this.config.humanParticipant ??
      DEFAULT_HUMAN;
    this.state.participants = [
      human,
      ...this.state.agents.map((agent) => ({
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
  ): void {
    const event: RuntimeEvent = {
      id: this.createId(),
      createdAt: this.now().toISOString(),
      ...input,
    };
    this.state.timeline.push({
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
  ): void {
    this.state.errors.push({
      id: this.createId(),
      createdAt: this.now().toISOString(),
      ...input,
    });
    this.pushRuntimeEvent({
      type: 'runtime-error',
      agentId: input.agentId,
      details: input.details ?? input.message,
      sourceTraceId: input.sourceTraceId,
    });
    this.pushDebugLog({
      kind: 'runtime-error',
      sweep: this.state.execution.sweepCount,
      agentId: input.agentId,
      agentName: input.agentId
        ? this.participantName(input.agentId)
        : undefined,
      details: `${input.message}${input.details ? `: ${input.details}` : ''}`,
    });
  }

  private pushDebugLog(input: Omit<DebugLogEntry, 'id' | 'createdAt'>): void {
    this.state.debugLogs.push({
      id: `debug-${this.state.debugLogs.length + 1}`,
      createdAt: this.now().toISOString(),
      ...input,
    });
  }

  private getTimelineMessages(): ChatMessage[] {
    return this.state.timeline
      .filter(
        (entry): entry is TimelineMessageEntry => entry.kind === 'message',
      )
      .map((entry) => entry.message);
  }

  private findMessageEntryById(
    messageId: string,
  ): TimelineMessageEntry | undefined {
    return this.state.timeline.find(
      (entry): entry is TimelineMessageEntry =>
        entry.kind === 'message' && entry.message.id === messageId,
    );
  }

  private getActiveManualCutoffIndex(): number | null {
    for (let index = this.state.timeline.length - 1; index >= 0; index -= 1) {
      const entry = this.state.timeline[index];
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

  private formatPreviewCutoffLabel(cutoff: AgentContextCutoff): string {
    const activeAgentCount = this.getActiveAgents().length;
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

  private participantName(participantId: string): string {
    return (
      this.state.participants.find(
        (participant) => participant.id === participantId,
      )?.name ?? participantId
    );
  }

  private persist(): void {
    this.storage.save(this.getState());
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
