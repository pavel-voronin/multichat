import type {
  AgentConfig,
  AgentExecutionMode,
  ChatMessage,
  ChatTabState,
  DebugLogEntry,
  MessageInspectionIndex,
  RequestTrace,
  RuntimeError,
  RuntimeEvent,
  TimelineHistoryCutoffEntry,
  TimelineMessageEntry,
  TransportUsage,
  WorkspaceState,
} from './types';
import { deepClone } from './utils';

export function createRequestTrace(input: {
  createId: () => string;
  now: () => Date;
  agent: AgentConfig;
  mode: AgentExecutionMode;
  fallback: boolean;
  parentTraceId: string | null;
  triggeringMessageIds: string[];
  visibleMessageIds: string[];
  nonSelfVisibleMessageIds: string[];
  tab: ChatTabState;
}): RequestTrace {
  const trace: RequestTrace = {
    id: input.createId(),
    sweep: input.tab.execution.sweepCount,
    agentId: input.agent.id,
    agentName: input.agent.name,
    mode: input.mode,
    fallback: input.fallback,
    status: 'running',
    startedAt: input.now().toISOString(),
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
  input.tab.requestTraces[trace.id] = trace;
  if (trace.parentTraceId) {
    input.tab.requestTraces[trace.parentTraceId]?.childTraceIds.push(trace.id);
    trace.links.push({ kind: 'parent', traceId: trace.parentTraceId });
  }
  for (const messageId of trace.triggeringMessageIds) {
    linkTraceToMessage(messageId, trace.id, 'triggering', input.tab);
    trace.links.push({ kind: 'triggering-message', messageId });
  }
  for (const messageId of trace.visibleMessageIds) {
    linkTraceToMessage(messageId, trace.id, 'visible', input.tab);
    trace.links.push({ kind: 'visible-message', messageId });
  }
  return trace;
}

export function completeRequestTrace(input: {
  now: () => Date;
  traceId: string;
  status: RequestTrace['status'];
  usage?: TransportUsage;
  action?: unknown;
  error?: string;
  tab: ChatTabState;
  promptCostUsd: number;
}): void {
  const trace = input.tab.requestTraces[input.traceId];
  if (!trace) {
    return;
  }

  trace.status = input.status;
  trace.finishedAt = input.now().toISOString();
  if (input.usage) {
    trace.usage = {
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      totalTokens: input.usage.totalTokens,
      estimatedCost: input.usage.estimatedCost,
      promptCostUsd: input.promptCostUsd,
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

export function attachProducedMessageToTrace(
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
  const index = getMessageInspectionIndexEntry(messageId, tab);
  index.sourceTraceId = traceId;
}

export function updateMessageSourceTrace(
  messageId: string,
  traceId: string | undefined,
  tab: ChatTabState,
): void {
  if (!traceId) {
    return;
  }

  const index = getMessageInspectionIndexEntry(messageId, tab);
  index.sourceTraceId = traceId;
}

export function getMessageInspectionIndexEntry(
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

export function linkTraceToMessage(
  messageId: string,
  traceId: string,
  kind: 'triggering' | 'visible',
  tab: ChatTabState,
): void {
  const index = getMessageInspectionIndexEntry(messageId, tab);
  const target =
    kind === 'triggering' ? index.triggeringTraceIds : index.visibleTraceIds;
  if (!target.includes(traceId)) {
    target.push(traceId);
  }
  if (!index.downstreamTraceIds.includes(traceId)) {
    index.downstreamTraceIds.push(traceId);
  }
}

export function cloneTraces(traceIds: string[], tab: ChatTabState): RequestTrace[] {
  return traceIds
    .map((traceId) => tab.requestTraces[traceId])
    .filter((item): item is RequestTrace => Boolean(item))
    .map((item) => deepClone(item));
}

export function getMessageById(
  messageId: string,
  tab: ChatTabState,
): ChatMessage | null {
  return findMessageEntryById(messageId, tab)?.message ?? null;
}

export function pushRuntimeEvent(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  payload: Pick<
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
  >;
}): void {
  const event: RuntimeEvent = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    ...input.payload,
  };
  input.tab.timeline.push({
    id: event.id,
    createdAt: event.createdAt,
    kind: 'technical-event',
    event,
  });
}

export function pushRuntimeError(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  workspace: WorkspaceState;
  payload: Pick<
    RuntimeError,
    'agentId' | 'message' | 'details' | 'sourceTraceId'
  >;
  participantName: (participantId: string, tab: ChatTabState) => string;
}): void {
  input.workspace.errors.push({
    id: input.createId(),
    createdAt: input.now().toISOString(),
    ...input.payload,
  });
  pushRuntimeEvent({
    createId: input.createId,
    now: input.now,
    tab: input.tab,
    payload: {
      type: 'runtime-error',
      agentId: input.payload.agentId,
      details: input.payload.details ?? input.payload.message,
      sourceTraceId: input.payload.sourceTraceId,
    },
  });
  pushDebugLog({
    now: input.now,
    workspace: input.workspace,
    payload: {
      kind: 'runtime-error',
      sweep: input.tab.execution.sweepCount,
      agentId: input.payload.agentId,
      agentName: input.payload.agentId
        ? input.participantName(input.payload.agentId, input.tab)
        : undefined,
      details: `${input.payload.message}${input.payload.details ? `: ${input.payload.details}` : ''}`,
    },
  });
}

export function pushDebugLog(input: {
  now: () => Date;
  workspace: WorkspaceState;
  payload: Omit<DebugLogEntry, 'id' | 'createdAt'>;
}): void {
  input.workspace.debugLogs.push({
    id: `debug-${input.workspace.debugLogs.length + 1}`,
    createdAt: input.now().toISOString(),
    ...input.payload,
  });
}

export function getTimelineMessages(tab: ChatTabState): ChatMessage[] {
  return tab.timeline
    .filter((entry): entry is TimelineMessageEntry => entry.kind === 'message')
    .map((entry) => entry.message);
}

export function findMessageEntryById(
  messageId: string,
  tab: ChatTabState,
): TimelineMessageEntry | undefined {
  return tab.timeline.find(
    (entry): entry is TimelineMessageEntry =>
      entry.kind === 'message' && entry.message.id === messageId,
  );
}

export function getActiveManualCutoffIndex(tab: ChatTabState): number | null {
  for (let index = tab.timeline.length - 1; index >= 0; index -= 1) {
    const entry = tab.timeline[index];
    if (entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual') {
      return index;
    }
  }

  return null;
}

export function createManualCutoffEntry(input: {
  createId: () => string;
  now: () => Date;
}): TimelineHistoryCutoffEntry {
  const createdAt = input.now().toISOString();
  return {
    id: input.createId(),
    createdAt,
    kind: 'history-cutoff',
    cutoff: {
      source: 'manual',
    },
  };
}
