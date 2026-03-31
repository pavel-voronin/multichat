import type {
  ChatTabState,
  ParticipantMessageEntry,
  RequestTrace,
} from './types';
import {
  cloneTraces,
  getEntryInspectionIndexEntry,
  getParticipantEntryById,
} from './diagnostics';
import { deepClone } from './utils';

export function getRelatedRequestTraces(
  traceId: string,
  tab: ChatTabState,
): RequestTrace[] {
  const trace = tab.requestTraces[traceId];
  if (!trace) return [];

  const relatedTraceIds = new Set<string>();
  if (trace.parentTraceId) relatedTraceIds.add(trace.parentTraceId);
  for (const childTraceId of trace.childTraceIds) {
    relatedTraceIds.add(childTraceId);
  }
  for (const messageId of [
    ...trace.triggeringMessageIds,
    ...trace.visibleMessageIds,
    ...trace.downstreamMessageIds,
  ]) {
    const index = tab.entryInspectionIndex[messageId];
    for (const relatedTraceId of index?.downstreamTraceIds ?? []) {
      if (relatedTraceId !== traceId) relatedTraceIds.add(relatedTraceId);
    }
    if (index?.sourceTraceId && index.sourceTraceId !== traceId) {
      relatedTraceIds.add(index.sourceTraceId);
    }
  }

  return Array.from(relatedTraceIds)
    .map((id) => tab.requestTraces[id])
    .filter((item): item is RequestTrace => Boolean(item))
    .map((item) => deepClone(item));
}

export function getInspectionSubjectForMessage(
  messageId: string,
  tab: ChatTabState,
): {
  entry: ParticipantMessageEntry | null;
  sourceTrace: RequestTrace | null;
  triggeringTraces: RequestTrace[];
  visibleOnlyTraces: RequestTrace[];
  downstreamTraces: RequestTrace[];
} {
  const entry = getParticipantEntryById(messageId, tab);
  const index = getEntryInspectionIndexEntry(messageId, tab);
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
    entry: deepClone(entry ?? null),
    sourceTrace: deepClone(sourceTrace),
    triggeringTraces: cloneTraces(index.triggeringTraceIds, tab),
    visibleOnlyTraces: cloneTraces(visibleOnlyTraceIds, tab),
    downstreamTraces: cloneTraces(downstreamTraceIds, tab),
  };
}

export function getMessageInspectionGraph(
  messageId: string,
  tab: ChatTabState,
): {
  entry: ParticipantMessageEntry | null;
  sourceTrace: RequestTrace | null;
  triggeringTraces: RequestTrace[];
  visibleOnlyTraces: RequestTrace[];
  downstreamTraces: RequestTrace[];
  relatedEntries: ParticipantMessageEntry[];
} {
  const subject = getInspectionSubjectForMessage(messageId, tab);
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
      ...(trace.producedMessageIds ?? []),
    ]) {
      relatedMessageIds.add(relatedMessageId);
    }
  }
  relatedMessageIds.delete(messageId);

  return {
    ...subject,
    relatedEntries: Array.from(relatedMessageIds)
      .map((id) => getParticipantEntryById(id, tab))
      .filter((item): item is ParticipantMessageEntry => Boolean(item))
      .map((item) => deepClone(item)),
  };
}
