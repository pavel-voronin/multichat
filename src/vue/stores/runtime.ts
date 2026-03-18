import { defineStore } from 'pinia';
import { markRaw, ref, shallowRef } from 'vue';
import type { MultiChatRuntime, RuntimeState } from '../../core';

export const useRuntimeStore = defineStore('runtime', () => {
  const runtime = shallowRef<MultiChatRuntime | null>(null);
  const state = ref<RuntimeState>(undefined as unknown as RuntimeState);
  let unsubscribe: (() => void) | null = null;

  function initialize(nextRuntime: MultiChatRuntime): void {
    if (runtime.value === nextRuntime) {
      return;
    }

    unsubscribe?.();
    runtime.value = markRaw(nextRuntime);
    state.value = nextRuntime.getState();
    unsubscribe = nextRuntime.subscribe((nextState) => {
      state.value = nextState;
    });
  }

  function dispose(): void {
    unsubscribe?.();
    unsubscribe = null;
    runtime.value = null;
    state.value = undefined as unknown as RuntimeState;
  }

  function requireRuntime(): MultiChatRuntime {
    if (!runtime.value) {
      throw new Error('MultiChat runtime was not initialized');
    }

    return runtime.value;
  }

  function requireState(): RuntimeState {
    if (!runtime.value) {
      throw new Error('MultiChat runtime state was not initialized');
    }

    return state.value;
  }

  return {
    runtime,
    state,
    initialize,
    dispose,
    requireRuntime,
    requireState,
  };
});
