# Inspector Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the inspector modal with a better header layout, renamed/new tabs, ModelCard in the Participant tab, split JSON accordions, system message inspection support, and a "Used In" tab.

**Architecture:** All changes stay within the existing inspector modal, its store, and two supporting components (ModelCard, InspectorMessageLine). No new files needed. The `InspectionTab` union type in `ui.ts` drives TypeScript enforcement across the board.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), TypeScript, Pinia, Tailwind CSS (via `@apply`), Vitest + Vue Test Utils for integration tests.

**Spec:** `docs/superpowers/specs/2026-03-23-inspector-improvements-design.md`

---

## File Map

| File                                                       | What changes                                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/vue/stores/ui.ts`                                     | `InspectionTab` type updated to 4 new IDs; default `'participant'`                                                         |
| `src/vue/stores/inspection.ts`                             | `canInspectMessage` allows system msgs; `openForMessage` smart default tab; add + export `usedInMessagesForCurrentMessage` |
| `src/vue/components/ModelCard.vue`                         | Add `readonly?: boolean` prop; hide Change button when true                                                                |
| `src/vue/components/timeline/InspectorMessageLine.vue`     | Single computed string format instead of multi-span                                                                        |
| `src/vue/components/RequestInspectionModal.vue`            | Header layout, 4 tabs, Participant/Input/Output/Used-In content                                                            |
| `tests/vue/components/multi-agent-chat/inspection.test.ts` | Update tab label references; add tests for new tabs and system message                                                     |

---

## Task 1: Update InspectionTab type in ui.ts

**Files:**

- Modify: `src/vue/stores/ui.ts`

- [ ] **Step 1: Update the type and all references**

In `src/vue/stores/ui.ts`, make these changes:

```ts
// Line 4: change
export type InspectionTab = 'participant' | 'input' | 'output' | 'used-in';

// Line 47: change defaultUiState() return
activeInspectionTab: 'participant',

// Line 63: change ref initial value
const activeInspectionTab = ref<InspectionTab>('participant');
```

`UiStateSnapshot` and `ChatScopedUiStateSnapshot` interfaces don't need changes — the type of `activeInspectionTab: InspectionTab` stays the same, only the union values change.

**⚠️ DO NOT COMMIT after this step.** `inspection.ts` and `RequestInspectionModal.vue` still reference the old IDs (`'agent'`, `'request'`, `'result'`), so the TypeScript build is broken until Task 5 fixes the modal. The commit for `ui.ts` will happen together with the modal changes in Task 5 Step 10.

---

## Task 2: Update inspection store

**Files:**

- Modify: `src/vue/stores/inspection.ts`
- Test: `tests/vue/components/multi-agent-chat/inspection.test.ts`

- [ ] **Step 1: Write a failing test for system message inspection**

Add this test to `tests/vue/components/multi-agent-chat/inspection.test.ts` (before the closing `});` of the `describe` block):

```ts
it('system message timestamp is inspectable (active trigger)', async () => {
  // createDefaultAgent adds "Alpha" — the runtime emits a participant_joined system message.
  // System message rows have class message-line-system.
  // Currently canInspectMessage returns false for system messages, so their timestamps
  // have message-time-trigger but NOT message-time-trigger-active (disabled).
  const runtime = createRuntime(); // default: creates Alpha agent
  const wrapper = mountChat(runtime);

  const systemLine = wrapper.find('.message-line-system');
  expect(systemLine.exists()).toBe(true);
  const trigger = systemLine.find('.message-time-trigger');
  expect(trigger.exists()).toBe(true);
  // This FAILS before the fix: the system message timestamp is not active
  expect(trigger.classes()).toContain('message-time-trigger-active');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/pavel/projects/multichat && npx vitest run tests/vue/components/multi-agent-chat/inspection.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — the system message trigger does not have `message-time-trigger-active`.

- [ ] **Step 3: Update inspection.ts**

In `src/vue/stores/inspection.ts`:

**a) Fix `canInspectMessage` (line 107-109) — remove the `!isSystemMessage` restriction:**

```ts
function canInspectMessage(_message: ChatMessage): boolean {
  return true;
}
```

**b) Fix `openForMessage` (line 65-70) — smart default tab:**

```ts
function openForMessage(messageId: string): void {
  inspectionHistory.value = [messageId];
  inspectionHistoryIndex.value = 0;
  ui.showRequestInspection = true;
  const message = findMessageById(state.value, messageId);
  ui.activeInspectionTab = isSystemMessage(message) ? 'used-in' : 'participant';
}
```

Note: `isSystemMessage` is already imported at line 9.

**c) Add `usedInMessagesForCurrentMessage` computed after `currentActionForTrace` (around line 62):**

```ts
const usedInMessagesForCurrentMessage = computed<ChatMessage[]>(() => {
  const messageId = currentInspectedMessage.value?.id;
  if (!messageId) return [];
  const index = diagnostics.value.messageInspectionIndex[messageId];
  if (!index) return [];
  return index.downstreamTraceIds
    .map((traceId) => diagnostics.value.requestTraces[traceId])
    .filter(Boolean)
    .map((trace) =>
      trace.producedMessageId
        ? findMessageById(state.value, trace.producedMessageId)
        : null,
    )
    .filter((m): m is ChatMessage => m !== null);
});
```

**d) Export in the `return {}` block** — add `usedInMessagesForCurrentMessage` to the computed section (after `currentActionForTrace`):

```ts
usedInMessagesForCurrentMessage,
```

- [ ] **Step 4: Run the test to confirm it now passes**

```bash
cd /Users/pavel/projects/multichat && npx vitest run tests/vue/components/multi-agent-chat/inspection.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: the new `'system message timestamp is inspectable'` test passes. Some existing tests may fail due to old tab IDs in the modal — that's expected and will be fixed in Tasks 5 and 6.

- [ ] **Step 5: Commit**

```bash
git add src/vue/stores/inspection.ts tests/vue/components/multi-agent-chat/inspection.test.ts
git commit -m "feat: allow system message inspection, smart default tab, add usedInMessagesForCurrentMessage"
```

---

## Task 3: Add readonly prop to ModelCard

**Files:**

- Modify: `src/vue/components/ModelCard.vue`

- [ ] **Step 1: Add the `readonly` prop and conditionally hide the button**

In `src/vue/components/ModelCard.vue`, update the `<script setup>`:

```ts
const props = defineProps<{
  modelId: string;
  snapshot?: ModelSnapshot;
  readonly?: boolean;
}>();
```

Update the template — add `v-if="!props.readonly"` to the `UiButton`:

```html
<UiButton v-if="!readonly" size="sm" @click="$emit('change')">Change</UiButton>
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
cd /Users/pavel/projects/multichat && npx tsc --noEmit 2>&1 | grep ModelCard
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/ModelCard.vue
git commit -m "feat: add readonly prop to ModelCard to hide Change button"
```

---

## Task 4: Refactor InspectorMessageLine to plain text format

**Files:**

- Modify: `src/vue/components/timeline/InspectorMessageLine.vue`

- [ ] **Step 1: Rewrite the component**

Replace the entire file content with:

```vue
<template>
  <button type="button" :class="lineClass" @click="handleClick">
    {{ lineText }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '../../../core';
import { useInspectionStore } from '../../stores/inspection';
import {
  formatMessageAuthor,
  formatMessageTime,
} from '../../utils/chatFormatting';

const props = defineProps<{
  message: ChatMessage;
}>();

const inspection = useInspectionStore();

const lineText = computed(() => {
  const time = formatMessageTime(props.message.createdAt);
  const author = formatMessageAuthor(props.message, {
    byId: inspection.participantName,
  });
  return `[${time}] ${author} ${props.message.content}`;
});

const lineClass = computed(() =>
  props.message.target === 'private'
    ? 'inspector-line inspector-line-private'
    : 'inspector-line',
);

function handleClick(): void {
  inspection.navigateTo(props.message.id);
}
</script>

<style scoped>
@reference "../../../styles.css";

.inspector-line {
  @apply block w-full break-words text-left text-[13px] leading-6 text-neutral-800 transition-colors hover:bg-neutral-100/80 rounded px-1 -mx-1;
}

.inspector-line-private {
  @apply italic text-orange-700;
}
</style>
```

Note: `formatMessageAuthor` already returns `<Author>` or `<Sender -> Recipient>` — no need to replicate that logic. The time is wrapped in `[…]` here to match chat history format.

- [ ] **Step 2: Run all inspection tests**

```bash
cd /Users/pavel/projects/multichat && npx vitest run tests/vue/components/multi-agent-chat/inspection.test.ts 2>&1 | tail -20
```

Expected: no new failures from this component change. The `.inspector-line` CSS class is still present so the navigation test still finds `querySelectorAll('.inspector-line')`.

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/timeline/InspectorMessageLine.vue
git commit -m "refactor: render InspectorMessageLine as single plain-text string"
```

---

## Task 5: Rewrite RequestInspectionModal

This is the largest task. Do it in sub-steps, running tsc after each to catch errors early.

**Files:**

- Modify: `src/vue/components/RequestInspectionModal.vue`

- [ ] **Step 1: Update the `<script setup>` — tabs array, new computed, imports**

Replace the `tabs` array and add new computeds. The full updated `<script setup>` section:

```ts
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useInspectionStore } from '../stores/inspection';
import { useUiStore } from '../stores/ui';
import {
  formatMessageAuthor,
  formatMessageTime,
} from '../utils/chatFormatting';
import { formatMessageCost } from '../utils/costing';
import InspectorMessageLine from './timeline/InspectorMessageLine.vue';
import ModelCard from './ModelCard.vue';

const tabs = [
  { id: 'participant' as const, label: 'Participant' },
  { id: 'input' as const, label: 'Input' },
  { id: 'output' as const, label: 'Output' },
  { id: 'used-in' as const, label: 'Used In' },
];

const inspection = useInspectionStore();
const ui = useUiStore();
const {
  currentInspectedMessage: message,
  traceForCurrentMessage: trace,
  agentForCurrentMessage: agent,
  currentActionForTrace: action,
  usedInMessagesForCurrentMessage: usedInMessages,
} = storeToRefs(inspection);

// Header
const timeLabel = computed(() =>
  message.value ? formatMessageTime(message.value.createdAt) : '—',
);
const authorLabel = computed(() => {
  if (!message.value) return '—';
  return formatMessageAuthor(message.value, {
    byId: inspection.participantName,
  });
});
const costLabel = computed(() => {
  const cost = trace.value?.usage?.requestCostUsd;
  if (cost == null) return null;
  return formatMessageCost(cost);
});
const messageContentLabel = computed(() => message.value?.content ?? '');

// Participant tab
const agentNameLabel = computed(() => agent.value?.name ?? 'Human');
const modelId = computed(() => agent.value?.modelId ?? '');
const modelSnapshot = computed(() => agent.value?.modelSnapshot);
const agentPrompt = computed(() => agent.value?.systemPrompt ?? null);
const fullSystemPrompt = computed<string | null>(() => {
  const json = trace.value?.payloads.requestInputJson;
  if (!json || typeof json !== 'object') return null;
  const messages = (
    json as { messages?: Array<{ role: string; content: string }> }
  ).messages;
  return messages?.find((m) => m.role === 'system')?.content ?? null;
});

// Input tab
const startedAtLabel = computed(() =>
  trace.value ? formatMessageTime(trace.value.startedAt) : '—',
);
const durationLabel = computed(() => {
  if (!trace.value?.finishedAt) return '—';
  const ms =
    new Date(trace.value.finishedAt).getTime() -
    new Date(trace.value.startedAt).getTime();
  return `${(ms / 1000).toFixed(1)} s`;
});
const promptTokensLabel = computed(
  () => trace.value?.usage?.promptTokens?.toString() ?? '—',
);

// Output tab
const actionDetailLabel = computed(() => {
  if (!action.value) return '—';
  switch (action.value.type) {
    case 'speak_public':
      return 'Published to public chat';
    case 'send_private':
      return `Sent privately to ${inspection.participantName(action.value.to)}`;
    case 'stay_silent':
      return `Stayed silent: ${action.value.reason}`;
  }
});
const completionTokensLabel = computed(
  () => trace.value?.usage?.completionTokens?.toString() ?? '—',
);

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

async function copyJson(value: unknown): Promise<void> {
  await globalThis.navigator?.clipboard?.writeText(formatJson(value));
}
```

- [ ] **Step 2: Update the template — header**

Replace the `<header class="inspection-header">` block with:

```html
<header class="inspection-header">
  <div class="inspection-subject">
    <span class="inspection-time">{{ timeLabel }}</span>
    <span class="inspection-sep"> </span>
    <span class="inspection-author">{{ authorLabel }}</span>
    <template v-if="costLabel">
      <span class="inspection-sep"> </span>
      <span class="inspection-cost">{{ costLabel }}</span>
    </template>
    <span class="inspection-sep"> </span>
    <span class="inspection-msg">{{ messageContentLabel }}</span>
  </div>
  <div class="inspection-nav">
    <button
      class="inspection-nav-btn"
      :disabled="!inspection.canGoBack"
      aria-label="Back"
      @click="inspection.navigateBack"
    >
      ←
    </button>
    <button
      class="inspection-nav-btn"
      :disabled="!inspection.canGoForward"
      aria-label="Forward"
      @click="inspection.navigateForward"
    >
      →
    </button>
  </div>
  <button class="inspection-close" aria-label="Close" @click="inspection.close">
    ✕
  </button>
</header>
```

- [ ] **Step 3: Update the template — tab bar**

The tab bar template stays the same (it iterates `tabs` dynamically). No changes needed beyond the `tabs` array update done in Step 1.

- [ ] **Step 4: Update the template — Participant tab (was Agent)**

Replace the `v-if="ui.activeInspectionTab === 'agent'"` section with:

```html
<section
  v-if="ui.activeInspectionTab === 'participant'"
  class="inspection-panel"
>
  <template v-if="agent">
    <p class="inspection-field-label">{{ agentNameLabel }}</p>
    <ModelCard
      :model-id="modelId"
      :snapshot="modelSnapshot"
      :readonly="true"
      class="mb-4"
    />
  </template>
  <p v-else class="inspection-field-label mb-4">Human</p>

  <div class="inspection-prompt-block">
    <p class="inspection-field-label">Agent Prompt</p>
    <pre v-if="agentPrompt" class="inspection-prompt">{{ agentPrompt }}</pre>
    <p v-else class="inspection-na">—</p>
  </div>

  <div class="inspection-prompt-block">
    <p class="inspection-field-label">Full System Prompt (sent)</p>
    <pre v-if="fullSystemPrompt" class="inspection-prompt">
{{ fullSystemPrompt }}</pre
    >
    <p v-else class="inspection-na">—</p>
  </div>
</section>
```

- [ ] **Step 5: Update the template — Input tab (was Request)**

Replace the `v-else-if="ui.activeInspectionTab === 'request'"` section with:

```html
<section
  v-else-if="ui.activeInspectionTab === 'input'"
  class="inspection-panel"
>
  <template v-if="trace">
    <div class="inspection-block">
      <p class="inspection-field-label">Context</p>
      <div class="inspection-message-list">
        <InspectorMessageLine
          v-for="msg in inspection.contextMessagesForCurrentTrace"
          :key="msg.id"
          :message="msg"
        />
        <p
          v-if="!inspection.contextMessagesForCurrentTrace.length"
          class="inspection-na"
        >
          No context messages.
        </p>
      </div>
    </div>
    <div class="inspection-meta-grid">
      <div>
        <p class="inspection-field-label">Started</p>
        <p class="inspection-field-value">{{ startedAtLabel }}</p>
      </div>
      <div>
        <p class="inspection-field-label">Duration</p>
        <p class="inspection-field-value">{{ durationLabel }}</p>
      </div>
      <div>
        <p class="inspection-field-label">Input tokens</p>
        <p class="inspection-field-value">{{ promptTokensLabel }}</p>
      </div>
    </div>
  </template>
  <p v-else class="inspection-na">No request data.</p>
</section>
```

- [ ] **Step 6: Update the template — Output tab (was Result)**

Replace the `v-else-if="ui.activeInspectionTab === 'result'"` section with:

```html
<section
  v-else-if="ui.activeInspectionTab === 'output'"
  class="inspection-panel"
>
  <template v-if="trace">
    <div class="inspection-block">
      <p class="inspection-field-label">Action</p>
      <p class="inspection-field-value">{{ actionDetailLabel }}</p>
    </div>
    <div class="inspection-meta-grid">
      <div>
        <p class="inspection-field-label">Output tokens</p>
        <p class="inspection-field-value">{{ completionTokensLabel }}</p>
      </div>
      <div>
        <p class="inspection-field-label">Cost</p>
        <p class="inspection-field-value">{{ costLabel ?? '—' }}</p>
      </div>
      <div>
        <p class="inspection-field-label">Duration</p>
        <p class="inspection-field-value">{{ durationLabel }}</p>
      </div>
    </div>

    <details class="inspection-raw-json">
      <summary class="inspection-raw-json-summary">
        Request Input
        <button
          type="button"
          class="inspection-copy-btn"
          @click.prevent="copyJson(trace?.payloads.requestInputJson)"
        >
          Copy
        </button>
      </summary>
      <pre class="inspection-json">
{{ formatJson(trace.payloads.requestInputJson) }}</pre
      >
    </details>

    <details class="inspection-raw-json mt-2">
      <summary class="inspection-raw-json-summary">
        Response Output
        <button
          type="button"
          class="inspection-copy-btn"
          @click.prevent="copyJson(trace?.payloads.responseOutputJson)"
        >
          Copy
        </button>
      </summary>
      <pre class="inspection-json">
{{ formatJson(trace.payloads.responseOutputJson) }}</pre
      >
    </details>
  </template>
  <p v-else class="inspection-na">No request data.</p>
</section>
```

- [ ] **Step 7: Add Used In tab section (after Output section, before `</div>`)**

```html
<section
  v-else-if="ui.activeInspectionTab === 'used-in'"
  class="inspection-panel"
>
  <div class="inspection-message-list">
    <InspectorMessageLine
      v-for="msg in usedInMessages"
      :key="msg.id"
      :message="msg"
    />
    <p v-if="!usedInMessages.length" class="inspection-na">
      No messages used this in their context.
    </p>
  </div>
</section>
```

- [ ] **Step 8: Update the `<style scoped>` section**

Replace the `.inspection-header`, `.inspection-subject`, `.inspection-nav`, `.inspection-cost` rules and add new ones. The full updated style section:

```css
<style scoped>
@reference "../../styles.css";

.inspection-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/30 p-4 backdrop-blur-sm;
}

.inspection-card {
  @apply grid h-[min(90vh,48rem)] w-full max-w-2xl grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-md border border-neutral-300 bg-white shadow-xl;
}

.inspection-header {
  @apply flex items-center gap-2 border-b border-neutral-200 px-4 py-3;
}

.inspection-subject {
  @apply flex min-w-0 flex-1 items-center overflow-hidden text-[13px] whitespace-nowrap;
}

.inspection-time {
  @apply shrink-0 text-neutral-500;
}

.inspection-sep {
  @apply shrink-0 whitespace-pre text-neutral-400;
}

.inspection-author {
  @apply shrink-0 font-semibold text-neutral-900;
}

.inspection-cost {
  @apply shrink-0 text-emerald-700;
}

.inspection-msg {
  @apply min-w-0 truncate text-neutral-600;
}

.inspection-nav {
  @apply flex shrink-0 gap-1;
}

.inspection-nav-btn {
  @apply flex h-6 w-6 items-center justify-center rounded text-[13px] text-neutral-500 transition hover:bg-neutral-100 disabled:cursor-default disabled:opacity-30;
}

.inspection-close {
  @apply ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}

.inspection-tabs {
  @apply flex gap-1 border-b border-neutral-200 px-4 py-2;
}

.inspection-tab {
  @apply rounded border border-neutral-200 bg-white px-3 py-1 text-[12px] text-neutral-700 transition hover:bg-neutral-50;
}

.inspection-tab-active {
  @apply border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800;
}

.inspection-panel {
  @apply min-h-0 overflow-auto p-4;
}

.inspection-block {
  @apply mb-4;
}

.inspection-field-label {
  @apply mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500;
}

.inspection-field-value {
  @apply text-[13px] text-neutral-900;
}

.inspection-na {
  @apply text-[13px] text-neutral-400;
}

.inspection-prompt-block {
  @apply mb-4 flex flex-col;
}

.inspection-prompt {
  @apply m-0 flex-1 overflow-auto rounded border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[11px] leading-5 text-neutral-700;
}

.inspection-message-list {
  @apply grid gap-0.5;
}

.inspection-meta-grid {
  @apply grid grid-cols-3 gap-3;
}

.inspection-raw-json {
  @apply mt-6 rounded border border-neutral-200;
}

.inspection-raw-json-summary {
  @apply flex cursor-pointer items-center justify-between px-3 py-2 text-[12px] font-semibold text-neutral-700 hover:bg-neutral-50;
}

.inspection-copy-btn {
  @apply rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-50;
}

.inspection-json {
  @apply m-0 overflow-auto rounded-b bg-neutral-950 px-3 py-2 text-[11px] leading-5 text-neutral-100;
}
</style>
```

- [ ] **Step 9: Run TypeScript check**

```bash
cd /Users/pavel/projects/multichat && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors (all old tab IDs are gone from the modal now).

- [ ] **Step 9: Run TypeScript check — must be clean now**

```bash
cd /Users/pavel/projects/multichat && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. All old tab IDs (`'agent'`, `'request'`, `'result'`) are gone from the modal.

- [ ] **Step 10: Commit ui.ts and the modal together**

```bash
git add src/vue/stores/ui.ts src/vue/components/RequestInspectionModal.vue
git commit -m "feat: rewrite inspector modal with new tabs, header layout, and Used In tab"
```

---

## Task 6: Update existing tests

**Files:**

- Modify: `tests/vue/components/multi-agent-chat/inspection.test.ts`

- [ ] **Step 1: Run the full test suite to see what's failing**

```bash
cd /Users/pavel/projects/multichat && npx vitest run tests/vue/components/multi-agent-chat/inspection.test.ts 2>&1 | tail -40
```

Expected: failures in tests that reference old tab names (`'Agent'`, `'Request'`, `'Result'`).

- [ ] **Step 2: Update all old tab name references**

In `inspection.test.ts`, make the following replacements:

| Old text                                  | New text                                |
| ----------------------------------------- | --------------------------------------- |
| `'Agent'` (when looking for tab label)    | `'Participant'`                         |
| `'Request'` (when looking for tab button) | `'Input'`                               |
| `'Result'` (when looking for tab button)  | `'Output'`                              |
| `textContent).toContain('Agent')`         | `textContent).toContain('Participant')` |
| `textContent).toContain('Request')`       | `textContent).toContain('Input')`       |
| `textContent).toContain('Result')`        | `textContent).toContain('Output')`      |

Affected tests:

**1.** `'opens inspector for a human message showing Agent / Request / Result tabs'`

- Rename to `'opens inspector for a human message showing Participant / Input / Output / Used In tabs'`
- Change all three `toContain` assertions: `'Agent'` → `'Participant'`, `'Request'` → `'Input'`, `'Result'` → `'Output'`
- Add: `expect(document.body.textContent).toContain('Used In');`

**2.** `'shows N/A for model and no system prompt for a human message on Agent tab'`

- Rename to `'shows Human label and no prompts for a human message on Participant tab'`
- **Remove** both `toContain('Model')` and `toContain('—')` assertions entirely — the tab no longer has a "Model" field label
- **Add** `expect(document.body.textContent).toContain('Human');` (the tab shows "Human" for non-agent messages)
- **Add** `expect(document.body.textContent).toContain('Agent Prompt');` (the prompt label is always present)

**3.** `'shows no request data on Request tab for a human message'`

- Change the button finder: `'Request'` → `'Input'`

**4.** `'shows speak_public action in Result tab for an agent message'`

- Change the button finder: `'Result'` → `'Output'`

**5.** `'shows no request data on Result tab for a human message'`

- Change the button finder: `'Result'` → `'Output'`

**6.** `'closes the inspector'`

- Change `toContain('Agent')` → `toContain('Participant')`

**7.** `'shows stay_silent action in Result tab for an agent message'`

- Change `toContain('Agent')` → `toContain('Participant')`

**8.** Navigation test (`'back button becomes active after navigating to a context message'`)

- Change the button finder: `'Request'` → `'Input'`

**9.** `'opens inspector for an agent message showing model and system prompt on Agent tab'`

- Keep `toContain('model-a:free')` — the ModelCard still renders the model ID
- **Remove** `toContain('prompt')` (too vague)
- **Add** `toContain('Agent Prompt')` — the label for the agent's system prompt block

**New tests to add** (the ones moved from Task 2):

```ts
it('opens on Participant tab by default for a regular message', async () => {
  const runtime = createRuntime({ createDefaultAgent: false });
  await runtime.sendMessage({
    senderId: 'human',
    content: 'default tab test',
    target: 'public',
    triggerSweep: false,
  });
  const wrapper = mountChat(runtime);
  await wrapper.get('.message-time-trigger-active').trigger('click');
  // The Participant tab label is visible and the tab bar is rendered
  expect(document.body.textContent).toContain('Participant');
  expect(document.body.textContent).toContain('Used In');
});

it('Used In tab shows empty state for a message with no downstream usage', async () => {
  const runtime = createRuntime({ createDefaultAgent: false });
  await runtime.sendMessage({
    senderId: 'human',
    content: 'used in test',
    target: 'public',
    triggerSweep: false,
  });
  const wrapper = mountChat(runtime);
  await wrapper.get('.message-time-trigger-active').trigger('click');

  const usedInTab = Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'Used In',
  );
  expect(usedInTab).toBeDefined();
  usedInTab!.click();
  await wrapper.vm.$nextTick();

  expect(document.body.textContent).toContain(
    'No messages used this in their context',
  );
});
```

- [ ] **Step 3: Run tests to verify they all pass**

```bash
cd /Users/pavel/projects/multichat && npx vitest run tests/vue/components/multi-agent-chat/inspection.test.ts 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 4: Run the full test suite**

```bash
cd /Users/pavel/projects/multichat && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/vue/components/multi-agent-chat/inspection.test.ts
git commit -m "test: update inspection tests for renamed tabs and new features"
```

---

## Done

All 6 tasks complete. The inspector now has:

- Header: `[time] [author] [$cost] [message…]` on the left, `[← →] [✕]` on the right
- 4 tabs: Participant, Input, Output, Used In
- Participant tab: ModelCard + two system prompt blocks
- Input tab: plain-text message lines
- Output tab: two separate copy-able JSON accordions
- Used In tab: list of messages that used this one in their context
- System messages are inspectable, opening on Used In tab by default
