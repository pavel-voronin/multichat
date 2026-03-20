import { defineStore } from 'pinia';
import { markRaw, ref, shallowRef } from 'vue';
import type {
  DiagnosticsState,
  MultiChatRuntime,
  RuntimeState,
  WorkspaceState,
} from '../../core';

export const useRuntimeStore = defineStore('runtime', () => {
  const runtime = shallowRef<MultiChatRuntime | null>(null);
  const state = ref<RuntimeState>(undefined as unknown as RuntimeState);
  const diagnostics = ref<DiagnosticsState>(
    undefined as unknown as DiagnosticsState,
  );
  const workspace = ref<WorkspaceState>(undefined as unknown as WorkspaceState);
  let unsubscribe: (() => void) | null = null;
  let unsubscribeDiagnostics: (() => void) | null = null;

  function initialize(nextRuntime: MultiChatRuntime): void {
    if (runtime.value === nextRuntime) {
      return;
    }

    unsubscribe?.();
    unsubscribeDiagnostics?.();
    runtime.value = markRaw(nextRuntime);
    state.value = nextRuntime.getState();
    diagnostics.value = nextRuntime.getDiagnosticsState();
    workspace.value = nextRuntime.getWorkspaceState();
    unsubscribe = nextRuntime.subscribe((nextState) => {
      state.value = nextState;
      workspace.value = nextRuntime.getWorkspaceState();
    });
    unsubscribeDiagnostics = nextRuntime.subscribeDiagnostics((nextState) => {
      diagnostics.value = nextState;
    });
  }

  function dispose(): void {
    unsubscribe?.();
    unsubscribeDiagnostics?.();
    unsubscribe = null;
    unsubscribeDiagnostics = null;
    runtime.value = null;
    state.value = undefined as unknown as RuntimeState;
    diagnostics.value = undefined as unknown as DiagnosticsState;
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
    diagnostics,
    workspace,
    initialize,
    dispose,
    requireRuntime,
    requireState,
  };
});
