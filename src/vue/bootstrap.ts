import type { Pinia } from 'pinia';
import {
  createMultiChatRuntime,
  LocalStoragePersistenceAdapter,
  OpenRouterHttpTransport,
  type MultiChatRuntime,
} from '../core';
import { useMessageInputStore } from './stores/messageInput';
import { usePreferencesStore } from './stores/preferences';
import { useRuntimeStore } from './stores/runtime';
import { useUiStore } from './stores/ui';
import { setOverlayControls } from './useOverlayControls';

export function createDefaultRuntime(): MultiChatRuntime {
  return createMultiChatRuntime({
    transport: new OpenRouterHttpTransport(),
    storage: new LocalStoragePersistenceAdapter(),
  });
}

export function initializeChatApp(
  pinia: Pinia,
  runtime: MultiChatRuntime = createDefaultRuntime(),
): MultiChatRuntime {
  useUiStore(pinia).reset();
  usePreferencesStore(pinia).reset();
  useMessageInputStore(pinia).reset();
  useRuntimeStore(pinia).initialize(runtime);
  return runtime;
}

export function disposeChatApp(pinia: Pinia): void {
  useRuntimeStore(pinia).dispose();
  setOverlayControls(null);
}
