import { defineStore, storeToRefs } from 'pinia';
import { computed } from 'vue';
import type { MultiChatRuntime } from '../../core';
import type {
  ChatViewPreferences,
  VisibleTimelineEntry,
} from '../types';
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

  // Set of entry IDs that are muted (before active cutoff). Used by useEntryMuted composable.
  const mutedEntryIds = computed<Set<string>>(() => {
    const muted = new Set<string>();
    for (const entry of visibleTimelineEntries.value) {
      if ('isMuted' in entry && entry.isMuted) muted.add(entry.id);
    }
    return muted;
  });

  function participantNameById(participantId: string): string | null {
    return (
      state.value.participants.find(
        (participant) => participant.id === participantId,
      )?.name ?? null
    );
  }

  return {
    state,
    preferences,
    humanParticipant,
    visibleTimelineEntries,
    mutedEntryIds,
    participantNameById,
  };
});
