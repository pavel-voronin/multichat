# UI State Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist `PreferencesStore`, `showLogsPanel`, and `draftByTabId` to localStorage so they survive page reloads.

**Architecture:** A new `uiPersistence.ts` module exposes two plain functions (`loadUiState` / `saveUiState`) that read/write a single versioned localStorage key. `initializeChatApp` in `bootstrap.ts` loads persisted state before returning, applies it to the stores after `reset()`, and sets up a single `watch` to save on any change. Each affected store gets a `loadPersistedState` method.

**Tech Stack:** Vue 3, Pinia, Vitest, TypeScript — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-23-ui-state-persistence-design.md`

---

## File Map

| Action | File                                                           | Responsibility                                                      |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Create | `src/vue/uiPersistence.ts`                                     | `loadUiState` / `saveUiState` — all localStorage I/O and versioning |
| Modify | `src/vue/stores/preferences.ts`                                | Add `loadPersistedState`                                            |
| Modify | `src/vue/stores/ui.ts`                                         | Add `loadPersistedState`                                            |
| Modify | `src/vue/stores/messageInput.ts`                               | Expose `draftByTabId`, add `loadPersistedState`                     |
| Modify | `src/vue/bootstrap.ts`                                         | Load → reset → apply → watch; cleanup in `disposeChatApp`           |
| Create | `tests/vue/uiPersistence.test.ts`                              | Unit tests for `loadUiState` / `saveUiState`                        |
| Modify | `tests/vue/components/multi-agent-chat/helpers.ts`             | Clear localStorage in `afterEach` to prevent cross-test leakage     |
| Create | `tests/vue/components/multi-agent-chat/ui-persistence.test.ts` | Integration tests via `mountChat`                                   |

---

## Task 1: Create `uiPersistence.ts` with unit tests

**Files:**

- Create: `src/vue/uiPersistence.ts`
- Create: `tests/vue/uiPersistence.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `tests/vue/uiPersistence.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadUiState,
  saveUiState,
  defaultUiState,
  UI_PERSISTENCE_KEY,
} from '../../../src/vue/uiPersistence';

afterEach(() => {
  localStorage.clear();
});

describe('loadUiState', () => {
  it('returns defaults when localStorage is empty', () => {
    expect(loadUiState()).toEqual(defaultUiState());
  });

  it('returns stored values when data is valid', () => {
    const state = {
      version: 1,
      showSilentDecisions: true,
      costDisplayMode: 'net',
      showLogsPanel: true,
      draftByTabId: { 'tab-1': 'hello' },
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    expect(loadUiState()).toEqual({
      showSilentDecisions: true,
      costDisplayMode: 'net',
      showLogsPanel: true,
      draftByTabId: { 'tab-1': 'hello' },
    });
  });

  it('returns defaults and removes the key when version mismatches', () => {
    localStorage.setItem(
      UI_PERSISTENCE_KEY,
      JSON.stringify({ version: 999, showSilentDecisions: true }),
    );
    expect(loadUiState()).toEqual(defaultUiState());
    expect(localStorage.getItem(UI_PERSISTENCE_KEY)).toBeNull();
  });

  it('returns defaults when JSON is invalid', () => {
    localStorage.setItem(UI_PERSISTENCE_KEY, 'not-json{{{');
    expect(loadUiState()).toEqual(defaultUiState());
  });

  it('falls back costDisplayMode to default when value is not in allowlist', () => {
    const state = {
      version: 1,
      showSilentDecisions: false,
      costDisplayMode: 'turbo',
      showLogsPanel: false,
      draftByTabId: {},
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    expect(loadUiState().costDisplayMode).toBe('request');
  });

  it('falls back boolean fields to defaults when they have wrong type', () => {
    const state = {
      version: 1,
      showSilentDecisions: 'yes',
      costDisplayMode: 'request',
      showLogsPanel: 1,
      draftByTabId: {},
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    const result = loadUiState();
    expect(result.showSilentDecisions).toBe(false);
    expect(result.showLogsPanel).toBe(false);
  });

  it('filters non-string values from draftByTabId', () => {
    const state = {
      version: 1,
      showSilentDecisions: false,
      costDisplayMode: 'request',
      showLogsPanel: false,
      draftByTabId: { 'tab-1': 'hello', 'tab-2': 42, 'tab-3': null },
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    expect(loadUiState().draftByTabId).toEqual({ 'tab-1': 'hello' });
  });

  it('falls back draftByTabId to {} when it is not an object', () => {
    const state = {
      version: 1,
      showSilentDecisions: false,
      costDisplayMode: 'request',
      showLogsPanel: false,
      draftByTabId: 'bad',
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    expect(loadUiState().draftByTabId).toEqual({});
  });
});

describe('saveUiState', () => {
  it('writes to localStorage', () => {
    saveUiState({
      version: 1,
      showSilentDecisions: true,
      costDisplayMode: 'net',
      showLogsPanel: true,
      draftByTabId: { 'tab-1': 'hi' },
    });
    expect(localStorage.getItem(UI_PERSISTENCE_KEY)).not.toBeNull();
  });

  it('round-trips: save then load', () => {
    saveUiState({
      version: 1,
      showSilentDecisions: true,
      costDisplayMode: 'off',
      showLogsPanel: true,
      draftByTabId: { 'tab-a': 'draft' },
    });
    expect(loadUiState()).toEqual({
      showSilentDecisions: true,
      costDisplayMode: 'off',
      showLogsPanel: true,
      draftByTabId: { 'tab-a': 'draft' },
    });
  });
});
```

- [ ] **Step 1.2: Run tests — verify they fail**

```bash
cd /Users/pavel/projects/multichat && npx vitest run tests/vue/uiPersistence.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 1.3: Implement `src/vue/uiPersistence.ts`**

```ts
import type { CostDisplayMode } from './types';

export const UI_PERSISTENCE_KEY = 'multichat-ui-state';
export const UI_PERSISTENCE_VERSION = 1;

const COST_DISPLAY_MODES: CostDisplayMode[] = ['off', 'request', 'net'];

export interface UiPersistedState {
  version: number;
  showSilentDecisions: boolean;
  costDisplayMode: CostDisplayMode;
  showLogsPanel: boolean;
  draftByTabId: Record<string, string>;
}

export function defaultUiState(): Omit<UiPersistedState, 'version'> {
  return {
    showSilentDecisions: false,
    costDisplayMode: 'request',
    showLogsPanel: false,
    draftByTabId: {},
  };
}

export function loadUiState(): Omit<UiPersistedState, 'version'> {
  const defaults = defaultUiState();
  const raw = localStorage.getItem(UI_PERSISTENCE_KEY);
  if (!raw) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as UiPersistedState).version !== UI_PERSISTENCE_VERSION
  ) {
    localStorage.removeItem(UI_PERSISTENCE_KEY);
    return defaults;
  }

  const data = parsed as Record<string, unknown>;

  const showSilentDecisions =
    typeof data.showSilentDecisions === 'boolean'
      ? data.showSilentDecisions
      : defaults.showSilentDecisions;

  const costDisplayMode = COST_DISPLAY_MODES.includes(
    data.costDisplayMode as CostDisplayMode,
  )
    ? (data.costDisplayMode as CostDisplayMode)
    : defaults.costDisplayMode;

  const showLogsPanel =
    typeof data.showLogsPanel === 'boolean'
      ? data.showLogsPanel
      : defaults.showLogsPanel;

  let draftByTabId: Record<string, string> = {};
  if (
    typeof data.draftByTabId === 'object' &&
    data.draftByTabId !== null &&
    !Array.isArray(data.draftByTabId)
  ) {
    for (const [k, v] of Object.entries(data.draftByTabId)) {
      if (typeof v === 'string') {
        draftByTabId[k] = v;
      }
    }
  }

  return { showSilentDecisions, costDisplayMode, showLogsPanel, draftByTabId };
}

export function saveUiState(state: UiPersistedState): void {
  localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
}
```

- [ ] **Step 1.4: Run tests — verify they pass**

```bash
cd /Users/pavel/projects/multichat && npx vitest run tests/vue/uiPersistence.test.ts
```

Expected: all PASS

- [ ] **Step 1.5: Commit**

```bash
cd /Users/pavel/projects/multichat && git add src/vue/uiPersistence.ts tests/vue/uiPersistence.test.ts
git commit -m "feat: add uiPersistence module for localStorage UI state"
```

---

## Task 2: Add `loadPersistedState` to stores

**Files:**

- Modify: `src/vue/stores/preferences.ts`
- Modify: `src/vue/stores/ui.ts`
- Modify: `src/vue/stores/messageInput.ts`

- [ ] **Step 2.1: Update `usePreferencesStore`**

In `src/vue/stores/preferences.ts`, add `loadPersistedState` using an inline parameter type (do not import from `uiPersistence.ts` to avoid circular type dependency):

```ts
function loadPersistedState(data: {
  showSilentDecisions: boolean;
  costDisplayMode: CostDisplayMode;
}): void {
  showSilentDecisions.value = data.showSilentDecisions;
  costDisplayMode.value = data.costDisplayMode;
}
```

Add `loadPersistedState` to the return object.

- [ ] **Step 2.2: Update `useUiStore`**

In `src/vue/stores/ui.ts`, add `loadPersistedState` for `showLogsPanel`:

```ts
function loadPersistedState(data: { showLogsPanel: boolean }): void {
  showLogsPanel.value = data.showLogsPanel;
}
```

Add `loadPersistedState` to the return object.

- [ ] **Step 2.3: Update `useMessageInputStore`**

In `src/vue/stores/messageInput.ts`:

1. Add `draftByTabId` to the return object (currently internal only — not present in the return at lines 114-123)
2. Add `loadPersistedState` (must only set `draftByTabId`, not touch `messageInputElement`):

```ts
function loadPersistedState(data: {
  draftByTabId: Record<string, string>;
}): void {
  draftByTabId.value = data.draftByTabId;
}
```

Add both `draftByTabId` and `loadPersistedState` to the return object.

- [ ] **Step 2.4: Run typecheck**

```bash
cd /Users/pavel/projects/multichat && npx vue-tsc --noEmit
```

Expected: no errors

- [ ] **Step 2.5: Commit**

```bash
cd /Users/pavel/projects/multichat && git add src/vue/stores/preferences.ts src/vue/stores/ui.ts src/vue/stores/messageInput.ts
git commit -m "feat: add loadPersistedState to preferences, ui, and messageInput stores"
```

---

## Task 3: Wire up `bootstrap.ts`

**Files:**

- Modify: `src/vue/bootstrap.ts`

- [ ] **Step 3.1: Modify `bootstrap.ts` incrementally**

Read the current file first, then apply these changes:

**Add imports** at the top (alongside existing imports):

```ts
import { watch, type WatchStopHandle } from 'vue';
import {
  loadUiState,
  saveUiState,
  UI_PERSISTENCE_VERSION,
} from './uiPersistence';
```

**Add module-level variable** before `createDefaultRuntime`:

```ts
let stopUiWatch: WatchStopHandle | null = null;
```

**Replace the body of `initializeChatApp`** with:

```ts
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
  // If the previous initializeChatApp call left an active watch (can happen in tests
  // where multiple Pinia instances are created without calling disposeChatApp),
  // stop it before setting up a new one.
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
```

**Replace the body of `disposeChatApp`** with:

```ts
export function disposeChatApp(pinia: Pinia): void {
  // Stop the UI persistence watch. The spec says disposeChatApp needs no changes,
  // but without this the watcher would continue writing to localStorage after teardown.
  stopUiWatch?.();
  stopUiWatch = null;
  useRuntimeStore(pinia).dispose();
  setOverlayControls(null);
}
```

- [ ] **Step 3.2: Run typecheck**

```bash
cd /Users/pavel/projects/multichat && npx vue-tsc --noEmit
```

Expected: no errors

- [ ] **Step 3.3: Run full test suite**

```bash
cd /Users/pavel/projects/multichat && npx vitest run
```

Expected: all existing tests still pass

- [ ] **Step 3.4: Commit**

```bash
cd /Users/pavel/projects/multichat && git add src/vue/bootstrap.ts
git commit -m "feat: wire UI state persistence into initializeChatApp"
```

---

## Task 4: Integration tests + test helper cleanup

**Files:**

- Modify: `tests/vue/components/multi-agent-chat/helpers.ts`
- Create: `tests/vue/components/multi-agent-chat/ui-persistence.test.ts`

- [ ] **Step 4.1: Clear localStorage in test helpers**

In `tests/vue/components/multi-agent-chat/helpers.ts`, add after the existing imports:

```ts
import { afterEach } from 'vitest';

afterEach(() => {
  localStorage.clear();
});
```

> Vitest re-imports modules fresh per test file (each file runs in its own VM context). This means `helpers.ts` is re-executed for each test file that imports it, and the `afterEach` call re-registers cleanup in that file's scope. The result: `localStorage.clear()` runs after every test in every file that imports `helpers.ts`.

- [ ] **Step 4.2: Write integration tests**

Create `tests/vue/components/multi-agent-chat/ui-persistence.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { initializeChatApp } from '../../../../src/vue/bootstrap';
import { usePreferencesStore } from '../../../../src/vue/stores/preferences';
import { useUiStore } from '../../../../src/vue/stores/ui';
import { useMessageInputStore } from '../../../../src/vue/stores/messageInput';
import {
  saveUiState,
  UI_PERSISTENCE_VERSION,
} from '../../../../src/vue/uiPersistence';
import { createRuntime } from './helpers';

// helpers.ts also registers afterEach(() => localStorage.clear()) via module-level import.
// The explicit afterEach here is a safety guard for this file specifically.
afterEach(() => {
  localStorage.clear();
});

function mountStores(preloadLocalStorage?: Parameters<typeof saveUiState>[0]) {
  if (preloadLocalStorage) {
    saveUiState(preloadLocalStorage);
  }
  const pinia = createPinia();
  const runtime = createRuntime();
  initializeChatApp(pinia, runtime);
  return {
    preferences: usePreferencesStore(pinia),
    ui: useUiStore(pinia),
    messageInput: useMessageInputStore(pinia),
  };
}

describe('UI state persistence', () => {
  it('restores showSilentDecisions from localStorage', () => {
    const { preferences } = mountStores({
      version: UI_PERSISTENCE_VERSION,
      showSilentDecisions: true,
      costDisplayMode: 'request',
      showLogsPanel: false,
      draftByTabId: {},
    });
    expect(preferences.showSilentDecisions).toBe(true);
  });

  it('restores costDisplayMode from localStorage', () => {
    const { preferences } = mountStores({
      version: UI_PERSISTENCE_VERSION,
      showSilentDecisions: false,
      costDisplayMode: 'net',
      showLogsPanel: false,
      draftByTabId: {},
    });
    expect(preferences.costDisplayMode).toBe('net');
  });

  it('restores showLogsPanel from localStorage', () => {
    const { ui } = mountStores({
      version: UI_PERSISTENCE_VERSION,
      showSilentDecisions: false,
      costDisplayMode: 'request',
      showLogsPanel: true,
      draftByTabId: {},
    });
    expect(ui.showLogsPanel).toBe(true);
  });

  it('restores draftByTabId from localStorage', () => {
    const { messageInput } = mountStores({
      version: UI_PERSISTENCE_VERSION,
      showSilentDecisions: false,
      costDisplayMode: 'request',
      showLogsPanel: false,
      draftByTabId: { 'tab-default': 'my draft' },
    });
    expect(messageInput.draftByTabId).toEqual({ 'tab-default': 'my draft' });
  });

  it('uses defaults when localStorage is empty', () => {
    const { preferences, ui } = mountStores();
    expect(preferences.showSilentDecisions).toBe(false);
    expect(preferences.costDisplayMode).toBe('request');
    expect(ui.showLogsPanel).toBe(false);
  });

  it('writes to localStorage when preferences change', async () => {
    const { preferences } = mountStores();
    preferences.showSilentDecisions = true;

    // Allow Vue watcher to flush
    await new Promise((r) => setTimeout(r, 0));

    const { preferences: preferences2 } = mountStores();
    expect(preferences2.showSilentDecisions).toBe(true);
  });
});
```

- [ ] **Step 4.3: Run integration tests — verify they pass**

Tasks 1–3 are already complete by this point, so all tests should pass immediately.

```bash
cd /Users/pavel/projects/multichat && npx vitest run tests/vue/components/multi-agent-chat/ui-persistence.test.ts
```

Expected: all PASS

- [ ] **Step 4.4: Run full test suite**

```bash
cd /Users/pavel/projects/multichat && npx vitest run
```

Expected: all tests pass

- [ ] **Step 4.5: Commit**

```bash
cd /Users/pavel/projects/multichat && git add tests/vue/components/multi-agent-chat/helpers.ts tests/vue/components/multi-agent-chat/ui-persistence.test.ts
git commit -m "test: add UI state persistence integration tests"
```
