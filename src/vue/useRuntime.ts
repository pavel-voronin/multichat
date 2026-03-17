import { inject, provide } from 'vue';
import type { MultiChatRuntime } from '../core';

const runtimeInjectionKey = Symbol('multi-chat-runtime');

export function provideRuntime(runtime: MultiChatRuntime): void {
  provide(runtimeInjectionKey, runtime);
}

export function useRuntime(): MultiChatRuntime {
  const runtime = inject<MultiChatRuntime | null>(runtimeInjectionKey, null);
  if (!runtime) {
    throw new Error('MultiChat runtime was not provided');
  }

  return runtime;
}
