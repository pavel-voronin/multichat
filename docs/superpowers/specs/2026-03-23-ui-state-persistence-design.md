# UI State Persistence

**Date:** 2026-03-23

## Problem

User preferences and draft messages are lost on page reload. The following Vue stores reset to defaults on every load:

- `usePreferencesStore` — `showSilentDecisions`, `costDisplayMode`
- `useUiStore` — `showLogsPanel`
- `useMessageInputStore` — `draftByTabId`

The core `WorkspaceState` (chat history, agents, settings) is already persisted via IndexedDB. This spec covers the UI layer state only.

## Approach

A centralized `uiPersistence.ts` module manages a single `localStorage` key (`multichat-ui-state`). localStorage is chosen over IndexedDB because:

- Synchronous reads enable immediate initialization without async loading or render flicker
- Data volume is small (a few flags + short text drafts)
- Simpler implementation with no async chain in bootstrap

## Data Shape

```ts
// src/vue/uiPersistence.ts
// imports: CostDisplayMode from './types'

interface UiPersistedState {
  version: number;
  showSilentDecisions: boolean;
  costDisplayMode: CostDisplayMode;
  showLogsPanel: boolean;
  draftByTabId: Record<string, string>;
}
```

Stored under the key `multichat-ui-state`. Version mismatch causes `loadUiState` to delete the stale entry immediately and return defaults (not lazy-overwrite).

## Architecture

### `src/vue/uiPersistence.ts`

Plain functions, no class or singleton:

```ts
const UI_PERSISTENCE_VERSION = 1;

function defaultUiPersistedState(): UiPersistedState { ... }

export function loadUiState(): UiPersistedState
export function saveUiState(state: UiPersistedState): void
```

**`loadUiState`:** reads `localStorage.getItem('multichat-ui-state')`, parses JSON inside a try/catch. Returns defaults if:

- key is missing
- JSON parse fails
- `version` field does not match `UI_PERSISTENCE_VERSION` (also deletes the stale entry via `localStorage.removeItem`)
- boolean fields fail `typeof x === 'boolean'`
- `costDisplayMode` fails an allowlist check: `['off', 'request', 'net'].includes(x)` — falling back to the field's default if invalid (not discarding the whole object)
- `draftByTabId` fails `typeof x === 'object' && x !== null`; after the object check, any entry whose value is not a string is dropped (filter, not reject-all)

**`saveUiState`:** JSON.stringify + `localStorage.setItem`. Called synchronously.

### Store changes

#### `usePreferencesStore`

- Add `loadPersistedState(data: Pick<UiPersistedState, 'showSilentDecisions' | 'costDisplayMode'>)` method that sets both fields.

#### `useUiStore`

- Add `loadPersistedState(data: Pick<UiPersistedState, 'showLogsPanel'>)` method that sets `showLogsPanel`.

#### `useMessageInputStore`

- Expose `draftByTabId` ref in the store's return object (currently internal only).
- Add `loadPersistedState(data: Pick<UiPersistedState, 'draftByTabId'>)` method that sets `draftByTabId.value = data.draftByTabId`. Must not touch `messageInputElement`.

### `bootstrap.ts` — `initializeChatApp`

Steps execute synchronously with no async gaps or `nextTick` between them:

```ts
// 1. Read from localStorage (sync)
const persisted = loadUiState();

// 2. Reset stores to defaults
useUiStore(pinia).reset();
usePreferencesStore(pinia).reset();
useMessageInputStore(pinia).reset();

// 3. Apply persisted values immediately after reset
usePreferencesStore(pinia).loadPersistedState(persisted);
useUiStore(pinia).loadPersistedState(persisted);
useMessageInputStore(pinia).loadPersistedState(persisted);

// 4. Set up watches to persist changes
// Note: draftByTabId watch fires on every keystroke (new object ref per change).
// Per-keystroke localStorage.setItem is acceptable at this data size.
// If perf becomes an issue, replace with watchDebounced from VueUse.
watch(
  () => buildUiSnapshot(preferencesStore, uiStore, messageInputStore),
  (snapshot) => saveUiState(snapshot),
  { deep: true },
);
```

The single watch receives a computed snapshot of all three stores. `buildUiSnapshot` is a local helper in `bootstrap.ts`:

```ts
function buildUiSnapshot(...stores): UiPersistedState {
  return {
    version: UI_PERSISTENCE_VERSION,
    showSilentDecisions: preferencesStore.showSilentDecisions,
    costDisplayMode: preferencesStore.costDisplayMode,
    showLogsPanel: uiStore.showLogsPanel,
    draftByTabId: messageInputStore.draftByTabId,
  };
}
```

`disposeChatApp`: no changes needed.

## Versioning

`UI_PERSISTENCE_VERSION = 1`. On mismatch, `loadUiState` deletes the stale localStorage entry and returns defaults. Defaults are written to localStorage on the next change that triggers the watch.

## Out of Scope

- Data migration between versions (discard-on-mismatch is sufficient for now)
- Persisting other `useUiStore` fields (modal states are intentionally transient)
- Cross-tab synchronization via `storage` events
