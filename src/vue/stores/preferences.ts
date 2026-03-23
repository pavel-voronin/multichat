import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CostDisplayMode } from '../types';

export const usePreferencesStore = defineStore('preferences', () => {
  const showSilentDecisions = ref(false);
  const costDisplayMode = ref<CostDisplayMode>('request');

  function reset(): void {
    showSilentDecisions.value = false;
    costDisplayMode.value = 'request';
  }

  function loadPersistedState(data: {
    showSilentDecisions: boolean;
    costDisplayMode: CostDisplayMode;
  }): void {
    showSilentDecisions.value = data.showSilentDecisions;
    costDisplayMode.value = data.costDisplayMode;
  }

  return {
    showSilentDecisions,
    costDisplayMode,
    reset,
    loadPersistedState,
  };
});
