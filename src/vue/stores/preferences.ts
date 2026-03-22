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

  return {
    showSilentDecisions,
    costDisplayMode,
    reset,
  };
});
