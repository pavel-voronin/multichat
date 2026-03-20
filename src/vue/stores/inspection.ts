import { defineStore, storeToRefs } from 'pinia';
import { computed } from 'vue';
import type {
  ChatMessage,
  MultiChatRuntime,
  RequestTrace,
  RuntimeState,
} from '../../core';
import { useRuntimeStore } from './runtime';
import { useUiStore, type InspectionTab } from './ui';

export const useInspectionStore = defineStore('inspection', () => {
  const runtimeStore = useRuntimeStore();
  const ui = useUiStore();
  const { state } = storeToRefs(runtimeStore);
  const runtime = computed<MultiChatRuntime>(() => runtimeStore.requireRuntime());

  const currentMessage = computed(() =>
    ui.selectedMessageId
      ? findMessageById(state.value, ui.selectedMessageId)
      : null,
  );
  const currentTrace = computed(() =>
    ui.selectedTraceId ? runtime.value.getRequestTrace(ui.selectedTraceId) : null,
  );
  const messageGraph = computed(() =>
    ui.selectedMessageId
      ? runtime.value.getMessageInspectionGraph(ui.selectedMessageId)
      : null,
  );
  const relatedTraces = computed(() =>
    currentTrace.value
      ? runtime.value.getRelatedRequestTraces(currentTrace.value.id)
      : [],
  );

  function openForMessage(messageId: string) {
    ui.showRequestInspection = true;
    ui.inspectionTargetType = 'message';
    ui.selectedMessageId = messageId;
    ui.selectedTraceId = null;
    ui.activeInspectionTab = 'overview';
  }

  function openForTrace(traceId: string, messageId?: string | null) {
    ui.showRequestInspection = true;
    ui.inspectionTargetType = 'trace';
    ui.selectedTraceId = traceId;
    ui.selectedMessageId = messageId ?? null;
    ui.activeInspectionTab = 'overview';
  }

  function selectMessage(messageId: string) {
    ui.inspectionTargetType = 'message';
    ui.selectedMessageId = messageId;
    ui.selectedTraceId = null;
  }

  function selectTrace(traceId: string) {
    ui.inspectionTargetType = 'trace';
    ui.selectedTraceId = traceId;
  }

  function setTab(tab: InspectionTab) {
    ui.activeInspectionTab = tab;
  }

  function close() {
    ui.showRequestInspection = false;
  }

  function canInspectMessage(message: ChatMessage): boolean {
    if (message.sourceTraceId) {
      return true;
    }

    return runtime.value.getInspectionSubjectForMessage(message.id).downstreamTraces
      .length > 0;
  }

  function getInspectionSubjectForMessage(messageId: string) {
    return runtime.value.getInspectionSubjectForMessage(messageId);
  }

  function getRequestTrace(traceId: string): RequestTrace | null {
    return runtime.value.getRequestTrace(traceId);
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
        .map((messageId) => findMessageById(state.value, messageId))
        .filter((message): message is ChatMessage => Boolean(message)),
    );
  }

  function participantName(participantId?: string): string {
    if (!participantId) {
      return '';
    }

    return (
      state.value.participants.find(
        (participant) => participant.id === participantId,
      )?.name ?? participantId
    );
  }

  return {
    state,
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
    getRequestTrace,
    relatedMessagesForTrace,
    participantName,
  };
});

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
