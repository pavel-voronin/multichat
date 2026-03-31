import { defineStore, storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AgentConfig,
  ParticipantMessageEntry,
  RequestTrace,
  RuntimeState,
} from '../../core';
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

  // ── Current entry and its trace / agent ────────────────────────
  const currentInspectedEntry = computed<ParticipantMessageEntry | null>(() => {
    const entryId = inspectionHistory.value[inspectionHistoryIndex.value];
    if (!entryId) return null;
    return findParticipantEntryById(state.value, entryId);
  });

  const traceForCurrentEntry = computed<RequestTrace | null>(() => {
    const entry = currentInspectedEntry.value;
    if (!entry?.sourceTraceId) return null;
    return diagnostics.value.requestTraces[entry.sourceTraceId] ?? null;
  });

  const agentForCurrentEntry = computed<AgentConfig | null>(() => {
    const trace = traceForCurrentEntry.value;
    if (!trace) return null;
    return state.value.agents.find((a) => a.id === trace.agentId) ?? null;
  });

  const contextEntriesForCurrentTrace = computed<ParticipantMessageEntry[]>(
    () => {
      const trace = traceForCurrentEntry.value;
      if (!trace) return [];
      return trace.visibleMessageIds
        .map((id) => findParticipantEntryById(state.value, id))
        .filter((e): e is ParticipantMessageEntry => e !== null);
    },
  );

  const currentActionForTrace = computed<AgentToolCall | null>(() => {
    const payload = traceForCurrentEntry.value?.payloads.normalizedActionsJson;
    if (!Array.isArray(payload) || payload.length === 0) return null;
    return payload[0] as AgentToolCall;
  });

  const usedInEntriesForCurrentEntry = computed<ParticipantMessageEntry[]>(
    () => {
      const entryId = currentInspectedEntry.value?.id;
      if (!entryId) return [];
      const index = diagnostics.value.entryInspectionIndex[entryId];
      if (!index) return [];
      return index.downstreamTraceIds
        .map((traceId) => diagnostics.value.requestTraces[traceId])
        .filter(Boolean)
        .flatMap((trace) =>
          (trace.producedMessageIds ?? [])
            .map((msgId) => findParticipantEntryById(state.value, msgId))
            .filter((e): e is ParticipantMessageEntry => e !== null),
        );
    },
  );

  // ── Navigation ─────────────────────────────────────────────────
  function openForEntry(entryId: string): void {
    inspectionHistory.value = [entryId];
    inspectionHistoryIndex.value = 0;
    ui.showRequestInspection = true;
    ui.activeInspectionTab = 'participant';
  }

  function navigateTo(entryId: string): void {
    inspectionHistory.value = inspectionHistory.value.slice(
      0,
      inspectionHistoryIndex.value + 1,
    );
    inspectionHistory.value.push(entryId);
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
    currentInspectedEntry,
    traceForCurrentEntry,
    agentForCurrentEntry,
    contextEntriesForCurrentTrace,
    currentActionForTrace,
    usedInEntriesForCurrentEntry,
    // Actions
    openForEntry,
    navigateTo,
    navigateBack,
    navigateForward,
    reset,
    close,
    participantName,
  };
});

function findParticipantEntryById(
  state: RuntimeState,
  entryId: string,
): ParticipantMessageEntry | null {
  for (const entry of state.timeline) {
    if (entry.kind === 'participant-message' && entry.id === entryId) {
      return entry;
    }
  }
  return null;
}
