import type {
  AgentConfig,
  AgentExecutionMode,
  ChatTabState,
  DebugLogEntry,
  EntryInspectionIndex,
  ParticipantMessageEntry,
  RequestTrace,
  RuntimeError,
  RuntimeErrorEntry,
  SilentDecisionEntry,
  SweepFinishedEntry,
  SweepStartedEntry,
  SweepStoppedEntry,
  TimelineHistoryCutoffEntry,
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
    linkTraceToEntry(messageId, trace.id, 'triggering', input.tab);
    trace.links.push({ kind: 'triggering-message', messageId });
  }
  for (const messageId of trace.visibleMessageIds) {
    linkTraceToEntry(messageId, trace.id, 'visible', input.tab);
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
  const index = getEntryInspectionIndexEntry(messageId, tab);
  index.sourceTraceId = traceId;
}

export function updateEntrySourceTrace(
  entryId: string,
  traceId: string | undefined,
  tab: ChatTabState,
): void {
  if (!traceId) {
    return;
  }

  const index = getEntryInspectionIndexEntry(entryId, tab);
  index.sourceTraceId = traceId;
}

export function getEntryInspectionIndexEntry(
  entryId: string,
  tab: ChatTabState,
): EntryInspectionIndex {
  tab.entryInspectionIndex[entryId] ??= {
    sourceTraceId: undefined,
    downstreamTraceIds: [],
    triggeringTraceIds: [],
    visibleTraceIds: [],
  };
  return tab.entryInspectionIndex[entryId]!;
}

export function linkTraceToEntry(
  entryId: string,
  traceId: string,
  kind: 'triggering' | 'visible',
  tab: ChatTabState,
): void {
  const index = getEntryInspectionIndexEntry(entryId, tab);
  const target =
    kind === 'triggering' ? index.triggeringTraceIds : index.visibleTraceIds;
  if (!target.includes(traceId)) {
    target.push(traceId);
  }
  if (!index.downstreamTraceIds.includes(traceId)) {
    index.downstreamTraceIds.push(traceId);
  }
}

export function cloneTraces(
  traceIds: string[],
  tab: ChatTabState,
): RequestTrace[] {
  return traceIds
    .map((traceId) => tab.requestTraces[traceId])
    .filter((item): item is RequestTrace => Boolean(item))
    .map((item) => deepClone(item));
}

export function getTimelineParticipantEntries(
  tab: ChatTabState,
): ParticipantMessageEntry[] {
  return tab.timeline.filter(
    (entry): entry is ParticipantMessageEntry =>
      entry.kind === 'participant-message',
  );
}

export function findParticipantEntryById(
  entryId: string,
  tab: ChatTabState,
): ParticipantMessageEntry | undefined {
  return tab.timeline.find(
    (entry): entry is ParticipantMessageEntry =>
      entry.kind === 'participant-message' && entry.id === entryId,
  );
}

export function getParticipantEntryById(
  entryId: string,
  tab: ChatTabState,
): ParticipantMessageEntry | null {
  return findParticipantEntryById(entryId, tab) ?? null;
}

export function pushSweepStarted(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  agentId?: string;
}): void {
  const entry: SweepStartedEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'sweep-started',
    agentId: input.agentId,
  };
  input.tab.timeline.push(entry);
}

export function pushSweepFinished(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  agentId?: string;
  costUsd?: number;
  requestCostUsd?: number;
  ownPromptCostUsd?: number;
  downstreamPromptCostUsd?: number;
  downstreamPromptCostContributors?: SweepFinishedEntry['downstreamPromptCostContributors'];
}): void {
  const entry: SweepFinishedEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'sweep-finished',
    agentId: input.agentId,
    costUsd: input.costUsd,
    requestCostUsd: input.requestCostUsd,
    ownPromptCostUsd: input.ownPromptCostUsd,
    downstreamPromptCostUsd: input.downstreamPromptCostUsd,
    downstreamPromptCostContributors: input.downstreamPromptCostContributors,
  };
  input.tab.timeline.push(entry);
}

export function pushSweepStopped(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  agentId?: string;
}): void {
  const entry: SweepStoppedEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'sweep-stopped',
    agentId: input.agentId,
  };
  input.tab.timeline.push(entry);
}

export function pushSilentDecision(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  agentId: string;
  reason: string;
  sourceTraceId?: string;
  costUsd?: number;
  requestCostUsd?: number;
  ownPromptCostUsd?: number;
  downstreamPromptCostUsd?: number;
  downstreamPromptCostContributors?: SilentDecisionEntry['downstreamPromptCostContributors'];
}): void {
  const entry: SilentDecisionEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'silent-decision',
    agentId: input.agentId,
    reason: input.reason,
    sourceTraceId: input.sourceTraceId,
    costUsd: input.costUsd,
    requestCostUsd: input.requestCostUsd,
    ownPromptCostUsd: input.ownPromptCostUsd,
    downstreamPromptCostUsd: input.downstreamPromptCostUsd,
    downstreamPromptCostContributors: input.downstreamPromptCostContributors,
  };
  input.tab.timeline.push(entry);
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
  const entry: RuntimeErrorEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'runtime-error',
    agentId: input.payload.agentId ?? '',
    details: input.payload.details ?? input.payload.message,
    sourceTraceId: input.payload.sourceTraceId,
  };
  input.tab.timeline.push(entry);
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
