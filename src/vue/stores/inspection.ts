import { defineStore, storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import {
  type AgentConfig,
  type ChatMessage,
  type RequestTrace,
  type RuntimeState,
} from '../../core';
import { isSystemMessage } from '../../core/messages';
import type { AgentToolCall } from '../../core/types';
import { useDiagnosticsStore } from './diagnostics';
import { useRuntimeStore } from './runtime';
import { useUiStore } from './ui';

export const useInspectionStore = defineStore('inspection', () => {
  const runtimeStore = useRuntimeStore();
  const diagnosticsStore = useDiagnosticsStore();
  const ui = useUiStore();
  const { state } = storeToRefs(runtimeStore);
  const { diagnostics } = storeToRefs(diagnosticsStore);

  // ── History stack ──────────────────────────────────────────────
  const inspectionHistory = ref<string[]>([]);
  const inspectionHistoryIndex = ref(0);

  const canGoBack = computed(() => inspectionHistoryIndex.value > 0);
  const canGoForward = computed(
    () => inspectionHistoryIndex.value < inspectionHistory.value.length - 1,
  );

  // ── Current message and its trace / agent ──────────────────────
  const currentInspectedMessage = computed<ChatMessage | null>(() => {
    const messageId = inspectionHistory.value[inspectionHistoryIndex.value];
    if (!messageId) return null;
    return findMessageById(state.value, messageId);
  });

  const traceForCurrentMessage = computed<RequestTrace | null>(() => {
    const message = currentInspectedMessage.value;
    if (!message?.sourceTraceId) return null;
    return diagnostics.value.requestTraces[message.sourceTraceId] ?? null;
  });

  const agentForCurrentMessage = computed<AgentConfig | null>(() => {
    const trace = traceForCurrentMessage.value;
    if (!trace) return null;
    return state.value.agents.find((a) => a.id === trace.agentId) ?? null;
  });

  const contextMessagesForCurrentTrace = computed<ChatMessage[]>(() => {
    const trace = traceForCurrentMessage.value;
    if (!trace) return [];
    return trace.visibleMessageIds
      .map((id) => findMessageById(state.value, id))
      .filter((m): m is ChatMessage => m !== null);
  });

  const currentActionForTrace = computed<AgentToolCall | null>(() => {
    const payload = traceForCurrentMessage.value?.payloads.normalizedActionJson;
    if (!payload || typeof payload !== 'object') return null;
    return payload as AgentToolCall;
  });

  const usedInMessagesForCurrentMessage = computed<ChatMessage[]>(() => {
    const messageId = currentInspectedMessage.value?.id;
    if (!messageId) return [];
    const index = diagnostics.value.messageInspectionIndex[messageId];
    if (!index) return [];
    return index.downstreamTraceIds
      .map((traceId) => diagnostics.value.requestTraces[traceId])
      .filter(Boolean)
      .map((trace) =>
        trace.producedMessageId
          ? findMessageById(state.value, trace.producedMessageId)
          : null,
      )
      .filter((m): m is ChatMessage => m !== null);
  });

  // ── Navigation ─────────────────────────────────────────────────
  function openForMessage(messageId: string): void {
    inspectionHistory.value = [messageId];
    inspectionHistoryIndex.value = 0;
    ui.showRequestInspection = true;
    const message = findMessageById(state.value, messageId);
    ui.activeInspectionTab = message ? isSystemMessage(message) ? 'used-in' : 'participant' : 'participant';
  }

  function navigateTo(messageId: string): void {
    // Truncate forward history before pushing
    inspectionHistory.value = inspectionHistory.value.slice(
      0,
      inspectionHistoryIndex.value + 1,
    );
    inspectionHistory.value.push(messageId);
    inspectionHistoryIndex.value = inspectionHistory.value.length - 1;
    if (!ui.showRequestInspection) {
      ui.showRequestInspection = true;
    }
  }

  function navigateBack(): void {
    if (canGoBack.value) {
      inspectionHistoryIndex.value--;
    }
  }

  function navigateForward(): void {
    if (canGoForward.value) {
      inspectionHistoryIndex.value++;
    }
  }

  function reset(): void {
    inspectionHistory.value = [];
    inspectionHistoryIndex.value = 0;
  }

  function close(): void {
    ui.showRequestInspection = false;
  }

  // ── Utilities ──────────────────────────────────────────────────
  function canInspectMessage(_message: ChatMessage): boolean {
    return true;
  }

  function participantName(participantId?: string): string {
    if (!participantId) return '';
    return (
      state.value.participants.find((p) => p.id === participantId)?.name ??
      participantId
    );
  }

  return {
    // State
    inspectionHistory,
    inspectionHistoryIndex,
    // Computed
    canGoBack,
    canGoForward,
    currentInspectedMessage,
    traceForCurrentMessage,
    agentForCurrentMessage,
    contextMessagesForCurrentTrace,
    currentActionForTrace,
    usedInMessagesForCurrentMessage,
    // Actions
    openForMessage,
    navigateTo,
    navigateBack,
    navigateForward,
    reset,
    close,
    canInspectMessage,
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
