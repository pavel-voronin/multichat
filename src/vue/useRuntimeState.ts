import { onBeforeUnmount, shallowRef } from 'vue';
import type { RuntimeState } from '../core';
import type { MultiChatRuntime } from '../core';

export function useRuntimeState(runtime: MultiChatRuntime) {
  const state = shallowRef<RuntimeState>(runtime.getState());
  const unsubscribe = runtime.subscribe((nextState) => {
    state.value = nextState;
  });

  onBeforeUnmount(() => {
    unsubscribe();
  });

  return state;
}
