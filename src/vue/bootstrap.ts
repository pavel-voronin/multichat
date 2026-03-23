import type { Pinia } from 'pinia';
import {
  createHydratedMultiChatRuntime,
  IndexedDbPersistenceAdapter,
  OpenRouterHttpTransport,
  type MultiChatRuntime,
} from '../core';
import { useMessageInputStore } from './stores/messageInput';
import { usePreferencesStore } from './stores/preferences';
import { useRuntimeStore } from './stores/runtime';
import { useUiStore } from './stores/ui';
import { setOverlayControls } from './useOverlayControls';

export function createDefaultRuntime(): Promise<MultiChatRuntime> {
  return createHydratedMultiChatRuntime({
    transport: new OpenRouterHttpTransport(),
    storage: new IndexedDbPersistenceAdapter(),
  });
}

export function initializeChatApp(
  pinia: Pinia,
  runtime: MultiChatRuntime,
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
