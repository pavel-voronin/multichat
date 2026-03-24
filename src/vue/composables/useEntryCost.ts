import { computed } from 'vue';
import type { ChatEntry } from '../../core';
import { usePreferencesStore } from '../stores/preferences';
import { shouldShowMessageCost } from '../utils/costing';

export function useEntryCost(entry: ChatEntry) {
  const preferences = usePreferencesStore();
  const costDisplayMode = computed(() => preferences.costDisplayMode);
  const showCost = computed(() =>
    shouldShowMessageCost(entry, costDisplayMode.value),
  );
  return { costDisplayMode, showCost };
}
