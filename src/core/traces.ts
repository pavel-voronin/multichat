import type { ChatMessage, ChatTabState, RequestTrace } from './types';
import {
  cloneTraces,
  getMessageById,
  getMessageInspectionIndexEntry,
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
    const index = tab.messageInspectionIndex[messageId];
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
  message: ChatMessage | null;
  sourceTrace: RequestTrace | null;
  triggeringTraces: RequestTrace[];
  visibleOnlyTraces: RequestTrace[];
  downstreamTraces: RequestTrace[];
} {
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

export function getMessageInspectionGraph(
  messageId: string,
  tab: ChatTabState,
): {
  message: ChatMessage | null;
  sourceTrace: RequestTrace | null;
  triggeringTraces: RequestTrace[];
  visibleOnlyTraces: RequestTrace[];
  downstreamTraces: RequestTrace[];
  relatedMessages: ChatMessage[];
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
      ...(trace.producedMessageId ? [trace.producedMessageId] : []),
    ]) {
      relatedMessageIds.add(relatedMessageId);
    }
  }
  relatedMessageIds.delete(messageId);

  return {
    ...subject,
    relatedMessages: Array.from(relatedMessageIds)
      .map((id) => getMessageById(id, tab))
      .filter((item): item is ChatMessage => Boolean(item))
      .map((item) => deepClone(item)),
  };
}
