import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CostDisplayMode } from '../types';

export const usePreferencesStore = defineStore('preferences', () => {
  const showContextCutoffs = ref(false);
  const showSilentDecisions = ref(false);
  const costDisplayMode = ref<CostDisplayMode>('request');

  function reset(): void {
    showContextCutoffs.value = false;
    showSilentDecisions.value = false;
    costDisplayMode.value = 'request';
  }

  return {
    showContextCutoffs,
    showSilentDecisions,
    costDisplayMode,
    reset,
  };
});
