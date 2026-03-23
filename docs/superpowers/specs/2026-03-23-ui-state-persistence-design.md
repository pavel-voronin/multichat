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
interface UiPersistedState {
  version: number;           // migration guard
  showSilentDecisions: boolean;
  costDisplayMode: CostDisplayMode;
  showLogsPanel: boolean;
  draftByTabId: Record<string, string>;
}
```

Stored under the key `multichat-ui-state`. Version mismatch discards stored data and returns defaults.

## Architecture

### `src/vue/uiPersistence.ts`

Single-responsibility module:
- `loadUiState(): UiPersistedState` — reads and parses localStorage, returns defaults on missing/invalid/version-mismatch data
- `saveUiState(state: UiPersistedState): void` — serializes and writes to localStorage

No class, no singleton — plain functions. Consumers call them directly.

### Store changes

Each affected store gains a `loadPersistedState(data: UiPersistedState)` method (or equivalent) to apply loaded values on init:

- `usePreferencesStore` — accepts `showSilentDecisions`, `costDisplayMode`
- `useUiStore` — accepts `showLogsPanel`
- `useMessageInputStore` — accepts `draftByTabId`

Each store also adds a `watch` that calls `saveUiState` with the current snapshot whenever its relevant fields change. The three watches can be co-located in `bootstrap.ts` to keep stores free of persistence concerns, or placed inside each store — co-location in bootstrap is preferred for symmetry with the load logic.

### `bootstrap.ts` changes

`initializeChatApp`:
1. Call `loadUiState()` before store resets
2. Apply loaded state to each store after `reset()`
3. Set up `watch` calls to persist on change

`disposeChatApp`: no changes needed (data is saved incrementally).

## Versioning

`UI_PERSISTENCE_VERSION = 1`. On version mismatch, `loadUiState` returns the default object and the stale entry is overwritten on next save.

## Out of Scope

- Migrating old data between versions (discard-on-mismatch is sufficient for now)
- Persisting other `useUiStore` fields (modal states are intentionally transient)
- Cross-tab synchronization via `storage` events
