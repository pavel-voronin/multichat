# Welcome Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the empty WelcomeDialog with an API key connection step and two preset chat launchers, so first-time users can get into the product immediately.

**Architecture:** Static preset data lives in `src/vue/components/welcome/presets.ts` as a `WelcomeChatPreset[]`. Full canonical preset types live in `src/core/types.ts` for future import/export. `session.launchPreset` orchestrates tab/agent creation and draft pre-fill on the existing default tab. `WelcomeDialog.vue` is a thin component that wires stores to the UI.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), Pinia, TailwindCSS via semantic classes, Vitest + Vue Test Utils

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `src/core/types.ts` | Add `ChatPresetAgent`, `ChatPreset` types |
| Create | `src/vue/components/welcome/presets.ts` | `WelcomeChatPreset` type + `WELCOME_PRESETS` data |
| Modify | `src/vue/stores/messageInput.ts` | Add `setDraftForTab` method |
| Create | `tests/vue/stores/messageInput.test.ts` | Tests for `setDraftForTab` |
| Modify | `src/vue/stores/session.ts` | Add `launchPreset` action |
| Create | `tests/vue/components/multi-agent-chat/welcome.test.ts` | Integration tests for welcome flow |
| Modify | `src/vue/components/welcome/WelcomeDialog.vue` | Full UI implementation |

---

## Task 1: Add core preset types to `src/core/types.ts`

**Files:**
- Modify: `src/core/types.ts`

These are the canonical types for the future preset management feature. `WelcomeChatPreset` in the welcome module derives from these via `Omit`.

- [ ] **Step 1: Add types after `AgentConfig`**

Open `src/core/types.ts`. After the `AgentConfig` interface, add:

```ts
export interface ChatPresetAgent {
  name: string;
  systemPrompt: string;
  modelId: string;
}

export interface ChatPreset {
  version: 1;
  id: string;
  title: string;
  initialMessage: string;
  agents: ChatPresetAgent[];
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add ChatPreset and ChatPresetAgent types to core"
```

---

## Task 2: Create welcome preset data

**Files:**
- Create: `src/vue/components/welcome/presets.ts`

`WelcomeChatPreset` is `ChatPreset` with `modelId` removed from each agent — the user picks the model at launch time.

- [ ] **Step 1: Create the file**

Create `src/vue/components/welcome/presets.ts`:

```ts
import type { ChatPreset, ChatPresetAgent } from '../../../core';

type WelcomeChatPresetAgent = Omit<ChatPresetAgent, 'modelId'>;

export interface WelcomeChatPreset extends Omit<ChatPreset, 'agents'> {
  agents: WelcomeChatPresetAgent[];
}

export const WELCOME_PRESETS: WelcomeChatPreset[] = [
  {
    version: 1,
    id: 'fantasy-world',
    title: 'Fantasy world',
    initialMessage: 'Does magic need rules to be meaningful?',
    agents: [
      {
        name: 'Elara',
        systemPrompt:
          'You are Elara, a wizard who believes magic must follow strict laws to be reliable and safe. You speak with calm authority and cite historical disasters caused by uncontrolled magic. Keep responses concise and in character.',
      },
      {
        name: 'Dorin',
        systemPrompt:
          'You are Dorin, a skeptical scholar who thinks magic is inherently chaotic and any attempt to codify it is self-deception. You are sardonic and enjoy poking holes in arguments. Keep responses concise and in character.',
      },
    ],
  },
  {
    version: 1,
    id: 'product-team',
    title: 'Product team',
    initialMessage: 'Should we rebuild the onboarding flow from scratch or iterate on what we have?',
    agents: [
      {
        name: 'Architect',
        systemPrompt:
          'You are a senior software architect. You care deeply about long-term maintainability, clean abstractions, and avoiding technical debt. You push back on shortcuts. Keep responses concise and opinionated.',
      },
      {
        name: 'PM',
        systemPrompt:
          'You are a product manager focused on shipping value to users quickly. You weigh business impact over technical elegance. You challenge engineers to justify complexity. Keep responses concise and opinionated.',
      },
      {
        name: 'Developer',
        systemPrompt:
          'You are a pragmatic senior developer who has seen both over-engineering and under-engineering cause pain. You try to find the middle ground. Keep responses concise and grounded in real implementation concerns.',
      },
    ],
  },
];
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/welcome/presets.ts
git commit -m "feat: add welcome preset data"
```

---

## Task 3: Add `setDraftForTab` to `messageInput` store

**Files:**
- Modify: `src/vue/stores/messageInput.ts`
- Create: `tests/vue/stores/messageInput.test.ts`

`session.launchPreset` needs to set a draft for a specific tab ID without that tab being the active one. The existing `draftMessage` setter only works for the active tab.

- [ ] **Step 1: Write the failing test**

Create `tests/vue/stores/messageInput.test.ts`:

```ts
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { MultiChatRuntime } from '../../../src/core/runtime';
import { initializeChatApp } from '../../../src/vue/bootstrap';
import { useMessageInputStore } from '../../../src/vue/stores/messageInput';

function setup() {
  const pinia = createPinia();
  const runtime = new MultiChatRuntime({
    transport: {
      async listModels() { return []; },
      async runAgentTurn() {
        return { mode: 'tools', action: { type: 'stay_silent', reason: 'noop' } };
      },
    },
    storage: {
      load: async () => null,
      save: async () => {},
      reset: async () => {},
    },
  });
  initializeChatApp(pinia, runtime);
  return { pinia, runtime, messageInput: useMessageInputStore(pinia) };
}

describe('useMessageInputStore', () => {
  it('setDraftForTab sets a draft for an arbitrary tab without changing the active tab draft', () => {
    const { messageInput } = setup();

    messageInput.setDraftForTab('tab-xyz', 'hello world');

    expect(messageInput.draftByTabId['tab-xyz']).toBe('hello world');
  });

  it('setDraftForTab does not overwrite drafts for other tabs', () => {
    const { messageInput } = setup();

    messageInput.setDraftForTab('tab-a', 'message a');
    messageInput.setDraftForTab('tab-b', 'message b');

    expect(messageInput.draftByTabId['tab-a']).toBe('message a');
    expect(messageInput.draftByTabId['tab-b']).toBe('message b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/vue/stores/messageInput.test.ts
```

Expected: FAIL — `messageInput.setDraftForTab is not a function`

- [ ] **Step 3: Add `setDraftForTab` to the store**

In `src/vue/stores/messageInput.ts`, add the function after `clearDraft`:

```ts
function setDraftForTab(tabId: string, message: string): void {
  draftByTabId.value = { ...draftByTabId.value, [tabId]: message };
}
```

And add it to the return object:

```ts
return {
  draftMessage,
  draftByTabId,
  canSend,
  sendCurrentMessage,
  mentionParticipantById,
  setMessageInputElement,
  clearDraft,
  setDraftForTab,
  reset,
  loadPersistedState,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/vue/stores/messageInput.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/vue/stores/messageInput.ts tests/vue/stores/messageInput.test.ts
git commit -m "feat: add setDraftForTab to messageInput store"
```

---

## Task 4: Add `launchPreset` to session store

**Files:**
- Modify: `src/vue/stores/session.ts`
- Create: `tests/vue/components/multi-agent-chat/welcome.test.ts`

`launchPreset` repurposes the existing active tab: renames it, adds agents, sets the message draft, and closes the welcome modal.

- [ ] **Step 1: Write the failing test**

Create `tests/vue/components/multi-agent-chat/welcome.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import MultiAgentChat from '../../../../src/vue/components/app/MultiAgentChat.vue';
import { mount } from '@vue/test-utils';
import { createRuntime, mountChat } from './helpers';
import { useSessionStore } from '../../../../src/vue/stores/session';
import { useMessageInputStore } from '../../../../src/vue/stores/messageInput';
import { useUiStore } from '../../../../src/vue/stores/ui';
import { useRuntimeStore } from '../../../../src/vue/stores/runtime';
import { initializeChatApp, disposeChatApp } from '../../../../src/vue/bootstrap';
import type { WelcomeChatPreset } from '../../../../src/vue/components/welcome/presets';

afterEach(() => {
  document.body.innerHTML = '';
});

const testPreset: WelcomeChatPreset = {
  version: 1,
  id: 'test-preset',
  title: 'Test Chat',
  initialMessage: 'Hello agents!',
  agents: [
    { name: 'Agent One', systemPrompt: 'You are agent one.' },
    { name: 'Agent Two', systemPrompt: 'You are agent two.' },
  ],
};

describe('session.launchPreset', () => {
  it('renames the active tab to the preset title', () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const pinia = createPinia();
    initializeChatApp(pinia, runtime, { isFreshWorkspace: true });

    const session = useSessionStore(pinia);
    session.launchPreset(testPreset, 'openai/gpt-4o');

    const workspace = useRuntimeStore(pinia).workspace;
    const activeTab = workspace.tabs.find((t) => t.id === workspace.activeTabId);
    expect(activeTab?.title).toBe('Test Chat');

    disposeChatApp(pinia);
  });

  it('creates agents from the preset with the chosen model', () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const pinia = createPinia();
    initializeChatApp(pinia, runtime, { isFreshWorkspace: true });

    const session = useSessionStore(pinia);
    session.launchPreset(testPreset, 'openai/gpt-4o');

    const workspace = useRuntimeStore(pinia).workspace;
    const activeTab = workspace.tabs.find((t) => t.id === workspace.activeTabId);
    expect(activeTab?.agents).toHaveLength(2);
    expect(activeTab?.agents[0]).toMatchObject({ name: 'Agent One', modelId: 'openai/gpt-4o', systemPrompt: 'You are agent one.' });
    expect(activeTab?.agents[1]).toMatchObject({ name: 'Agent Two', modelId: 'openai/gpt-4o', systemPrompt: 'You are agent two.' });

    disposeChatApp(pinia);
  });

  it('sets the initial message as draft for the active tab', () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const pinia = createPinia();
    initializeChatApp(pinia, runtime, { isFreshWorkspace: true });

    const session = useSessionStore(pinia);
    session.launchPreset(testPreset, 'openai/gpt-4o');

    const workspace = useRuntimeStore(pinia).workspace;
    const tabId = workspace.activeTabId;
    const messageInput = useMessageInputStore(pinia);
    expect(messageInput.draftByTabId[tabId]).toBe('Hello agents!');

    disposeChatApp(pinia);
  });

  it('closes the welcome modal after launching', () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const pinia = createPinia();
    initializeChatApp(pinia, runtime, { isFreshWorkspace: true });

    const ui = useUiStore(pinia);
    expect(ui.showWelcomeModal).toBe(true);

    const session = useSessionStore(pinia);
    session.launchPreset(testPreset, 'openai/gpt-4o');

    expect(ui.showWelcomeModal).toBe(false);

    disposeChatApp(pinia);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/vue/components/multi-agent-chat/welcome.test.ts
```

Expected: FAIL — `session.launchPreset is not a function`

- [ ] **Step 3: Add `launchPreset` to `src/vue/stores/session.ts`**

Add the import at the top of the file (after existing imports):

```ts
import type { WelcomeChatPreset } from '../components/welcome/presets';
```

Add the function inside the store (after `resetRuntime`):

```ts
function launchPreset(preset: WelcomeChatPreset, modelId: string): void {
  const tabId = runtime.value.getWorkspaceState().activeTabId;
  runtime.value.renameTab(tabId, preset.title);
  for (const agent of preset.agents) {
    runtime.value.createAgent({ ...agent, modelId }, tabId);
  }
  messageInputStore.setDraftForTab(tabId, preset.initialMessage);
  uiStore.showWelcomeModal = false;
}
```

Add `launchPreset` to the return object:

```ts
return {
  updateRuntimeSettings,
  updateTurnOrdering,
  updateMaxAutoRounds,
  toggleSilentDecisions,
  cycleCostDisplayMode,
  resetAgentHistoryContext,
  clearDebugLogs,
  clearHistoryBeforeAgentCutoff,
  moveManualCutoffBefore,
  removeManualCutoff,
  stop,
  resetRuntime,
  updateHumanParticipant,
  launchPreset,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/vue/components/multi-agent-chat/welcome.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/vue/stores/session.ts tests/vue/components/multi-agent-chat/welcome.test.ts
git commit -m "feat: add launchPreset to session store"
```

---

## Task 5: Implement WelcomeDialog UI

**Files:**
- Modify: `src/vue/components/welcome/WelcomeDialog.vue`

Full single-screen layout: API key input at top, two preset cards + "Start exploring" card below. Preset cards are dimmed and disabled until models are loaded.

- [ ] **Step 1: Add welcome dialog tests to the integration test file**

Add to `tests/vue/components/multi-agent-chat/welcome.test.ts` (after existing describe block):

```ts
describe('WelcomeDialog UI', () => {
  it('shows the API key input and Connect button on a fresh workspace', () => {
    const runtime = createRuntime({ createDefaultAgent: false, setApiKey: false });
    mountChat(runtime, { isFreshWorkspace: true });

    expect(document.body.textContent).toContain('Welcome to Multichat');
    expect(document.body.querySelector('input[type="password"]')).toBeTruthy();
    expect(document.body.textContent).toContain('Connect');
  });

  it('shows preset cards and Start exploring card', () => {
    const runtime = createRuntime({ createDefaultAgent: false, setApiKey: false });
    mountChat(runtime, { isFreshWorkspace: true });

    expect(document.body.textContent).toContain('Fantasy world');
    expect(document.body.textContent).toContain('Product team');
    expect(document.body.textContent).toContain('Start exploring');
  });

  it('closes the dialog when Start exploring is clicked', async () => {
    const runtime = createRuntime({ createDefaultAgent: false, setApiKey: false });
    mountChat(runtime, { isFreshWorkspace: true });

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const exploreButton = buttons.find((b) => b.textContent?.includes('Start exploring'));
    expect(exploreButton).toBeTruthy();
    exploreButton!.click();

    await new Promise((r) => setTimeout(r, 0));

    expect(document.body.textContent).not.toContain('Welcome to Multichat');
  });
});
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
npm test -- tests/vue/components/multi-agent-chat/welcome.test.ts
```

Expected: The new 3 tests FAIL (the 4 from Task 4 should still PASS).

- [ ] **Step 3: Implement `WelcomeDialog.vue`**

Replace the entire contents of `src/vue/components/welcome/WelcomeDialog.vue`:

```vue
<template>
  <UiModal :open="ui.showWelcomeModal" size="md" @close="close">
    <template #title>
      <h2 class="welcome-title">Welcome to Multichat</h2>
    </template>

    <div class="welcome-body">
      <div class="welcome-key-section">
        <label class="welcome-key-label">
          <span class="welcome-label-row">
            <span class="welcome-label-text">OpenRouter API key</span>
            <a
              href="https://pavelvoronin.com/openrouter-api-key"
              class="welcome-help-link"
              target="_blank"
              rel="noreferrer"
            >How to get it</a>
          </span>
          <div class="welcome-key-row">
            <UiInput
              v-model="draftKey"
              class="welcome-key-input"
              type="password"
              placeholder="sk-or-v1-..."
              :disabled="isConnecting"
              @keydown.enter="connect"
            />
            <UiButton
              class="welcome-connect-button"
              variant="primary"
              :disabled="!draftKey.trim() || isConnecting"
              @click="connect"
            >
              {{ isConnecting ? 'Connecting...' : 'Connect' }}
            </UiButton>
          </div>
          <p v-if="connectError" class="welcome-error">{{ connectError }}</p>
          <p class="welcome-privacy-note">
            Your key is stored locally in your browser and only sent to OpenRouter.
          </p>
        </label>
      </div>

      <div class="welcome-divider" />

      <div class="welcome-presets-section">
        <span class="welcome-section-label">Or jump right in</span>
        <div class="welcome-cards-row">
          <div
            v-for="preset in WELCOME_PRESETS"
            :key="preset.id"
            class="welcome-preset-card"
            :class="{ 'welcome-preset-card--disabled': !isConnected }"
          >
            <div class="welcome-card-title">{{ preset.title }}</div>
            <div class="welcome-card-meta">{{ preset.agents.length }} agents</div>
            <UiSelect
              v-model="selectedModelId[preset.id]"
              class="welcome-model-select"
              :disabled="!isConnected"
            >
              <option value="" disabled>Choose model...</option>
              <option
                v-for="model in models.models"
                :key="model.id"
                :value="model.id"
              >
                {{ model.name }}
              </option>
            </UiSelect>
            <UiButton
              class="welcome-launch-button"
              variant="primary"
              :disabled="!isConnected || !selectedModelId[preset.id]"
              @click="launch(preset)"
            >
              Launch
            </UiButton>
          </div>

          <div class="welcome-explore-card">
            <div class="welcome-card-title">Start exploring</div>
            <div class="welcome-explore-bullets">
              <span>Create chats with any agents</span>
              <span>Mix models in one conversation</span>
              <span>Control who sees what</span>
            </div>
            <UiButton class="welcome-explore-button" @click="close">
              Start exploring
            </UiButton>
          </div>
        </div>
        <p v-if="!isConnected" class="welcome-locked-hint">
          Connect your API key above to unlock presets
        </p>
      </div>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useModelsStore } from '../../stores/models';
import { useSessionStore } from '../../stores/session';
import { useUiStore } from '../../stores/ui';
import { useRuntimeStore } from '../../stores/runtime';
import UiButton from '../ui/UiButton.vue';
import UiInput from '../ui/UiInput.vue';
import UiModal from '../ui/UiModal.vue';
import UiSelect from '../ui/UiSelect.vue';
import { WELCOME_PRESETS, type WelcomeChatPreset } from './presets';

const ui = useUiStore();
const session = useSessionStore();
const models = useModelsStore();
const runtime = useRuntimeStore();

const draftKey = ref(runtime.state?.settings.openRouterApiKey ?? '');
const isConnecting = ref(false);
const connectError = ref<string | null>(null);
const selectedModelId = ref<Record<string, string>>(
  Object.fromEntries(WELCOME_PRESETS.map((p) => [p.id, ''])),
);

const isConnected = computed(() => models.models.length > 0);

watch(
  () => ui.showWelcomeModal,
  (isOpen) => {
    if (!isOpen) return;
    draftKey.value = runtime.state?.settings.openRouterApiKey ?? '';
    connectError.value = null;
    selectedModelId.value = Object.fromEntries(WELCOME_PRESETS.map((p) => [p.id, '']));
  },
);

async function connect(): Promise<void> {
  const key = draftKey.value.trim();
  if (!key || isConnecting.value) return;
  isConnecting.value = true;
  connectError.value = null;
  session.updateRuntimeSettings({ openRouterApiKey: key });
  try {
    await models.fetchModels({ force: true });
    if (models.error) {
      connectError.value = models.error;
    }
  } finally {
    isConnecting.value = false;
  }
}

function launch(preset: WelcomeChatPreset): void {
  const modelId = selectedModelId.value[preset.id];
  if (!modelId) return;
  session.launchPreset(preset, modelId);
}

function close(): void {
  ui.showWelcomeModal = false;
}
</script>

<style scoped>
@reference "@styles";

.welcome-title {
  @apply m-0 text-base font-semibold;
}

.welcome-body {
  @apply flex flex-col gap-0 px-5 pb-5 pt-4;
}

.welcome-key-section {
  @apply flex flex-col gap-3;
}

.welcome-key-label {
  @apply flex flex-col gap-2;
}

.welcome-label-row {
  @apply flex items-center gap-2;
}

.welcome-label-text {
  @apply text-[12px] text-neutral-600;
}

.welcome-help-link {
  @apply text-[12px] text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 hover:decoration-neutral-500;
}

.welcome-key-row {
  @apply flex gap-2;
}

.welcome-key-input {
  @apply flex-1;
}

.welcome-connect-button {
  @apply shrink-0;
}

.welcome-error {
  @apply m-0 text-[12px] text-red-600;
}

.welcome-privacy-note {
  @apply m-0 text-[11px] text-neutral-400;
}

.welcome-divider {
  @apply my-4 border-t border-neutral-200;
}

.welcome-presets-section {
  @apply flex flex-col gap-3;
}

.welcome-section-label {
  @apply text-[11px] uppercase tracking-wider text-neutral-400;
}

.welcome-cards-row {
  @apply grid grid-cols-3 gap-3;
}

.welcome-preset-card {
  @apply flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 transition-opacity;
}

.welcome-preset-card--disabled {
  @apply opacity-40;
}

.welcome-card-title {
  @apply text-[13px] font-semibold;
}

.welcome-card-meta {
  @apply text-[11px] text-neutral-500;
}

.welcome-model-select {
  @apply w-full;
}

.welcome-launch-button {
  @apply w-full;
}

.welcome-explore-card {
  @apply flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3;
}

.welcome-explore-bullets {
  @apply flex flex-col gap-1 text-[11px] leading-relaxed text-neutral-500;
}

.welcome-explore-button {
  @apply mt-auto w-full;
}

.welcome-locked-hint {
  @apply m-0 text-center text-[11px] text-neutral-400;
}
</style>
```

- [ ] **Step 4: Run all welcome tests**

```bash
npm test -- tests/vue/components/multi-agent-chat/welcome.test.ts
```

Expected: PASS (all 7 tests)

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/vue/components/welcome/WelcomeDialog.vue
git commit -m "feat: implement welcome screen with API key connection and preset launchers"
```
