import { computed, type Ref } from 'vue';
import type {
  ChatMessage,
  RequestTrace,
  RuntimeState,
} from '../../core';
import type { useChatStore } from '../stores/chat';
import type { InspectionTab, useUiStore } from '../stores/ui';

export function useRequestInspection(input: {
  chat: ReturnType<typeof useChatStore>;
  state: Readonly<Ref<RuntimeState>>;
  ui: ReturnType<typeof useUiStore>;
}) {
  const currentMessage = computed(() =>
    input.ui.selectedMessageId
      ? findMessageById(input.state.value, input.ui.selectedMessageId)
      : null,
  );
  const currentTrace = computed(() =>
    input.ui.selectedTraceId
      ? input.chat.getRequestTrace(input.ui.selectedTraceId)
      : null,
  );
  const messageGraph = computed(() =>
    input.ui.selectedMessageId
      ? input.chat.getMessageInspectionGraph(input.ui.selectedMessageId)
      : null,
  );
  const relatedTraces = computed(() =>
    currentTrace.value
      ? input.chat.getRelatedRequestTraces(currentTrace.value.id)
      : [],
  );

  function openForMessage(messageId: string) {
    input.ui.showRequestInspection = true;
    input.ui.inspectionTargetType = 'message';
    input.ui.selectedMessageId = messageId;
    input.ui.selectedTraceId = null;
    input.ui.activeInspectionTab = 'overview';
  }

  function openForTrace(traceId: string, messageId?: string | null) {
    input.ui.showRequestInspection = true;
    input.ui.inspectionTargetType = 'trace';
    input.ui.selectedTraceId = traceId;
    input.ui.selectedMessageId = messageId ?? null;
    input.ui.activeInspectionTab = 'overview';
  }

  function selectMessage(messageId: string) {
    input.ui.inspectionTargetType = 'message';
    input.ui.selectedMessageId = messageId;
    input.ui.selectedTraceId = null;
  }

  function selectTrace(traceId: string) {
    input.ui.inspectionTargetType = 'trace';
    input.ui.selectedTraceId = traceId;
  }

  function setTab(tab: InspectionTab) {
    input.ui.activeInspectionTab = tab;
  }

  function close() {
    input.ui.showRequestInspection = false;
  }

  function canInspectMessage(message: ChatMessage): boolean {
    return input.chat.canInspectMessage(message);
  }

  function getInspectionSubjectForMessage(messageId: string) {
    return input.chat.getInspectionSubjectForMessage(messageId);
  }

  function relatedMessagesForTrace(trace: RequestTrace): ChatMessage[] {
    const relatedIds = [
      ...trace.triggeringMessageIds,
      ...trace.visibleMessageIds,
      ...trace.downstreamMessageIds,
      ...(trace.producedMessageId ? [trace.producedMessageId] : []),
    ];

    return dedupeMessages(
      relatedIds
        .map((messageId) => findMessageById(input.state.value, messageId))
        .filter((message): message is ChatMessage => Boolean(message)),
    );
  }

  function participantName(participantId?: string): string {
    if (!participantId) {
      return '';
    }

    return (
      input.state.value.participants.find(
        (participant) => participant.id === participantId,
      )?.name ?? participantId
    );
  }

  return {
    currentMessage,
    currentTrace,
    messageGraph,
    relatedTraces,
    openForMessage,
    openForTrace,
    selectMessage,
    selectTrace,
    setTab,
    close,
    canInspectMessage,
    getInspectionSubjectForMessage,
    relatedMessagesForTrace,
    participantName,
  };
}

function findMessageById(
  state: RuntimeState,
  messageId: string,
): ChatMessage | null {
  for (const entry of state.timeline) {
    if (entry.kind === 'message' && entry.message.id === messageId) {
      return entry.message;
    }
  }

  return null;
}

function dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const result: ChatMessage[] = [];

  for (const message of messages) {
    if (seen.has(message.id)) {
      continue;
    }

    seen.add(message.id);
    result.push(message);
  }

  return result;
}
