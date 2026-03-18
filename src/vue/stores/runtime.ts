import { defineStore } from 'pinia';
import { markRaw, ref, shallowRef } from 'vue';
import type { MultiChatRuntime, RuntimeState, WorkspaceState } from '../../core';

export const useRuntimeStore = defineStore('runtime', () => {
  const runtime = shallowRef<MultiChatRuntime | null>(null);
  const state = ref<RuntimeState>(undefined as unknown as RuntimeState);
  const workspace = ref<WorkspaceState>(undefined as unknown as WorkspaceState);
  let unsubscribe: (() => void) | null = null;

  function initialize(nextRuntime: MultiChatRuntime): void {
    if (runtime.value === nextRuntime) {
      return;
    }

    unsubscribe?.();
    runtime.value = markRaw(nextRuntime);
    state.value = nextRuntime.getState();
    workspace.value = nextRuntime.getWorkspaceState();
    unsubscribe = nextRuntime.subscribe((nextState) => {
      state.value = nextState;
      workspace.value = nextRuntime.getWorkspaceState();
    });
  }

  function dispose(): void {
    unsubscribe?.();
    unsubscribe = null;
    runtime.value = null;
    state.value = undefined as unknown as RuntimeState;
    workspace.value = undefined as unknown as WorkspaceState;
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
      workspace,
      initialize,
      dispose,
      requireRuntime,
      requireState,
    };
});
