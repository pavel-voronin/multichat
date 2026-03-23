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
import { watch, type WatchStopHandle } from 'vue';
import {
  loadUiState,
  saveUiState,
  UI_PERSISTENCE_VERSION,
} from './uiPersistence';

let stopUiWatch: WatchStopHandle | null = null;

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
  // 1. Load persisted UI state synchronously before any resets
  const persisted = loadUiState();

  // 2. Reset stores to defaults
  useUiStore(pinia).reset();
  usePreferencesStore(pinia).reset();
  useMessageInputStore(pinia).reset();

  // 3. Apply persisted values immediately after reset (synchronous, no nextTick)
  usePreferencesStore(pinia).loadPersistedState(persisted);
  useUiStore(pinia).loadPersistedState(persisted);
  useMessageInputStore(pinia).loadPersistedState(persisted);

  // 4. Initialize runtime
  useRuntimeStore(pinia).initialize(runtime);

  // 5. Set up watch to persist UI state on any change.
  // draftByTabId creates a new object reference on every keystroke; per-keystroke
  // localStorage.setItem is acceptable at this data size.
  // Stop any prior watch (can happen when multiple Pinia instances are created
  // in tests without calling disposeChatApp between them).
  stopUiWatch?.();
  const preferencesStore = usePreferencesStore(pinia);
  const uiStore = useUiStore(pinia);
  const messageInputStore = useMessageInputStore(pinia);

  stopUiWatch = watch(
    () => ({
      version: UI_PERSISTENCE_VERSION,
      showSilentDecisions: preferencesStore.showSilentDecisions,
      costDisplayMode: preferencesStore.costDisplayMode,
      showLogsPanel: uiStore.showLogsPanel,
      draftByTabId: messageInputStore.draftByTabId,
    }),
    (snapshot) => saveUiState(snapshot),
    { deep: true },
  );

  return runtime;
}

export function disposeChatApp(pinia: Pinia): void {
  // Stop the UI persistence watch to prevent writes to localStorage after teardown.
  stopUiWatch?.();
  stopUiWatch = null;
  useRuntimeStore(pinia).dispose();
  setOverlayControls(null);
}
