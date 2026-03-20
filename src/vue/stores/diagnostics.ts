import { defineStore, storeToRefs } from 'pinia';
import { useRuntimeStore } from './runtime';

export const useDiagnosticsStore = defineStore('diagnostics', () => {
  const runtimeStore = useRuntimeStore();
  const { diagnostics } = storeToRefs(runtimeStore);

  return {
    diagnostics,
  };
});
