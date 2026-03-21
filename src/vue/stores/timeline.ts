import { defineStore, storeToRefs } from 'pinia';
import { computed } from 'vue';
import type { MultiChatRuntime, RuntimeEvent } from '../../core';
import type { ChatViewPreferences, VisibleTimelineEntry } from '../types';
import { buildVisibleTimelineEntries } from '../utils/timeline';
import { usePreferencesStore } from './preferences';
import { useRuntimeStore } from './runtime';

export const useTimelineStore = defineStore('timeline', () => {
  const runtimeStore = useRuntimeStore();
  const preferencesStore = usePreferencesStore();
  const { state } = storeToRefs(runtimeStore);
  const runtime = computed<MultiChatRuntime>(() =>
    runtimeStore.requireRuntime(),
  );

  const preferences = computed<ChatViewPreferences>(() => ({
    showContextCutoffs: preferencesStore.showContextCutoffs,
    showSilentDecisions: preferencesStore.showSilentDecisions,
    costDisplayMode: preferencesStore.costDisplayMode,
  }));

  const humanParticipant = computed(
    () =>
      state.value.participants.find(
        (participant) => participant.role === 'human',
      ) ?? null,
  );

  const visibleTimelineEntries = computed<VisibleTimelineEntry[]>(() =>
    buildVisibleTimelineEntries({
      runtime: runtime.value,
      state: state.value,
      participantId: humanParticipant.value?.id ?? 'human',
      preferences: preferences.value,
    }),
  );

  function participantNameById(participantId: string): string | null {
    return (
      state.value.participants.find(
        (participant) => participant.id === participantId,
      )?.name ?? null
    );
  }

  function canInspectEvent(event: RuntimeEvent): boolean {
    return Boolean(event.sourceTraceId);
  }

  return {
    state,
    preferences,
    humanParticipant,
    visibleTimelineEntries,
    participantNameById,
    canInspectEvent,
  };
});
