# Model Browser Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite ModelBrowserDialog as a sortable table, add ✕ close buttons to all modals, and change new-agent creation to open the model browser first.

**Architecture:** Pure display logic (vendor dedup, price classification) is extracted to a tested utility module. UI store gets a `preselectedModelId` field for the new agent flow. Component changes are isolated to their respective `.vue` files.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, Tailwind CSS v4, Vitest

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `src/vue/utils/modelFormatting.ts` | **Create** | Pure functions: `cleanModelName`, `classifyPricing`, `formatPricePerM`, `formatContextLength` |
| `src/vue/utils/modelFormatting.test.ts` | **Create** | Vitest unit tests for all four functions |
| `src/vue/stores/ui.ts` | **Modify** | Add `preselectedModelId: string \| null` field, init, and reset |
| `src/vue/components/ModelBrowserDialog.vue` | **Rewrite** | Table layout, sortable columns, ✕ button, new context options, use utility functions |
| `src/vue/components/AgentWizard.vue` | **Modify** | Consume `ui.preselectedModelId` in `showAgentWizard` watcher |
| `src/vue/components/ParticipantsPanel.vue` | **Modify** | New-agent flow: open ModelBrowserDialog first, then wizard |
| `src/vue/components/HumanNameModal.vue` | **Modify** | Add ✕ button next to title |
| `src/vue/components/DeleteAgentModal.vue` | **Modify** | Add ✕ button next to title |
| `src/vue/components/SettingsModal.vue` | **Modify** | Add ✕ button next to title |
| `src/vue/components/RequestInspectionModal.vue` | **Modify** | Move existing "Close" button into title row, replace text with ✕ |

---

## Task 1: Extract model formatting utilities

**Files:**
- Create: `src/vue/utils/modelFormatting.ts`
- Create: `src/vue/utils/modelFormatting.test.ts`

- [ ] **Step 1: Create the utility module**

```typescript
// src/vue/utils/modelFormatting.ts

/**
 * Strip vendor prefix from model name if it matches the provider slug.
 * e.g. "Qwen: Qwen Plus 0728" with slug "qwen" → "Qwen Plus 0728"
 * e.g. "Claude 3.5 Sonnet" with slug "anthropic" → unchanged
 */
export function cleanModelName(name: string, modelId: string): string {
  const slug = modelId.includes('/') ? (modelId.split('/')[0] ?? '') : '';
  if (!slug) return name;
  const prefix = slug + ': ';
  if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
    return name.slice(prefix.length);
  }
  return name;
}

export type PricingDisplay =
  | { kind: 'free' }
  | { kind: 'variable' }
  | { kind: 'price'; input: string; output: string };

/**
 * Classify how to display pricing for a model row.
 * - free suffix OR both prices parse to 0 → { kind: 'free' }
 * - either price is negative → { kind: 'variable' }
 * - otherwise → { kind: 'price', input, output }
 */
export function classifyPricing(
  prompt: string | undefined,
  completion: string | undefined,
  modelId: string,
): PricingDisplay {
  if (modelId.endsWith(':free')) return { kind: 'free' };

  const p = parseFloat(prompt ?? 'NaN');
  const c = parseFloat(completion ?? 'NaN');

  if (!isNaN(p) && p < 0) return { kind: 'variable' };
  if (!isNaN(c) && c < 0) return { kind: 'variable' };

  if (!isNaN(p) && !isNaN(c) && p === 0 && c === 0) return { kind: 'free' };

  return {
    kind: 'price',
    input: formatPricePerM(prompt),
    output: formatPricePerM(completion),
  };
}

/**
 * Format a raw per-token price string to a per-million display string.
 * e.g. "0.000003" → "$3.00", "0.0000001" → "$0.1000", undefined → "—"
 */
export function formatPricePerM(raw: string | undefined): string {
  if (!raw) return '—';
  const perM = parseFloat(raw) * 1_000_000;
  if (isNaN(perM)) return '—';
  return `$${perM.toFixed(perM < 0.01 ? 4 : 2)}`;
}

/**
 * Format context length to a short string.
 * e.g. 200000 → "200k", 1000000 → "1M", 0/undefined → "—"
 */
export function formatContextLength(len: number | undefined): string {
  if (!len) return '—';
  if (len >= 1_000_000) return `${Math.round(len / 1_000_000)}M`;
  if (len >= 1_000) return `${Math.round(len / 1_000)}k`;
  return String(len);
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// src/vue/utils/modelFormatting.test.ts
import { describe, it, expect } from 'vitest';
import {
  cleanModelName,
  classifyPricing,
  formatPricePerM,
  formatContextLength,
} from './modelFormatting';

describe('cleanModelName', () => {
  it('strips matching vendor prefix', () => {
    expect(cleanModelName('Qwen: Qwen Plus 0728', 'qwen/qwen-plus-0728')).toBe('Qwen Plus 0728');
  });
  it('is case-insensitive for slug matching', () => {
    expect(cleanModelName('QWEN: something', 'qwen/model')).toBe('something');
  });
  it('leaves name unchanged when no match', () => {
    expect(cleanModelName('Claude 3.5 Sonnet', 'anthropic/claude-3-5-sonnet')).toBe('Claude 3.5 Sonnet');
  });
  it('leaves name unchanged when no slash in id', () => {
    expect(cleanModelName('Auto Router', 'openrouter/auto')).toBe('Auto Router');
  });
  it('does not strip partial slug matches', () => {
    expect(cleanModelName('Meta: something', 'meta-llama/model')).toBe('Meta: something');
  });
});

describe('classifyPricing', () => {
  it('returns free for :free suffix', () => {
    expect(classifyPricing('0', '0', 'provider/model:free')).toEqual({ kind: 'free' });
  });
  it('returns free when both prices are zero', () => {
    expect(classifyPricing('0', '0', 'openrouter/auto')).toEqual({ kind: 'free' });
  });
  it('returns free for zero with different formats', () => {
    expect(classifyPricing('0.00', '0.0', 'provider/model')).toEqual({ kind: 'free' });
  });
  it('returns variable for negative prompt price', () => {
    expect(classifyPricing('-0.000001', '0', 'openrouter/auto')).toEqual({ kind: 'variable' });
  });
  it('returns variable for negative completion price', () => {
    expect(classifyPricing('0', '-0.000001', 'openrouter/auto')).toEqual({ kind: 'variable' });
  });
  it('returns price for normal pricing', () => {
    expect(classifyPricing('0.000003', '0.000015', 'anthropic/claude')).toEqual({
      kind: 'price',
      input: '$3.00',
      output: '$15.00',
    });
  });
  it('does not treat mixed zero/non-zero as free', () => {
    const result = classifyPricing('0', '0.000001', 'provider/model');
    expect(result.kind).toBe('price');
  });
});

describe('formatPricePerM', () => {
  it('formats normal price', () => {
    expect(formatPricePerM('0.000003')).toBe('$3.00');
  });
  it('uses 4 decimal places for small prices', () => {
    expect(formatPricePerM('0.0000001')).toBe('$0.1000');
  });
  it('returns dash for undefined', () => {
    expect(formatPricePerM(undefined)).toBe('—');
  });
});

describe('formatContextLength', () => {
  it('formats millions', () => {
    expect(formatContextLength(1_000_000)).toBe('1M');
    expect(formatContextLength(200_000)).toBe('200k');
  });
  it('formats thousands', () => {
    expect(formatContextLength(128_000)).toBe('128k');
    expect(formatContextLength(8_000)).toBe('8k');
  });
  it('returns dash for zero or undefined', () => {
    expect(formatContextLength(0)).toBe('—');
    expect(formatContextLength(undefined)).toBe('—');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test
```

Expected: tests fail because module doesn't exist yet (if you created test before module) — or they pass immediately if you created both. Either way, confirm vitest runs without config errors.

- [ ] **Step 4: Run tests and confirm all pass**

```bash
pnpm test
```

Expected: all tests pass with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/vue/utils/modelFormatting.ts src/vue/utils/modelFormatting.test.ts
git commit -m "feat: add model formatting utilities with tests"
```

---

## Task 2: Add `preselectedModelId` to ui store

**Files:**
- Modify: `src/vue/stores/ui.ts`

- [ ] **Step 1: Add field to `UiStateSnapshot` interface and `ChatScopedUiStateSnapshot`**

In `src/vue/stores/ui.ts`, add `preselectedModelId: string | null` to both interfaces:

```typescript
export interface UiStateSnapshot {
  // ... existing fields ...
  preselectedModelId: string | null;  // add this
}

export interface ChatScopedUiStateSnapshot {
  // ... existing fields ...
  preselectedModelId: string | null;  // add this
}
```

- [ ] **Step 2: Add to `defaultUiState()`**

```typescript
function defaultUiState(): UiStateSnapshot {
  return {
    // ... existing fields ...
    preselectedModelId: null,  // add this
  };
}
```

- [ ] **Step 3: Add reactive ref and include in `reset()`, `resetChatScopedState()`, and return value**

```typescript
const preselectedModelId = ref<string | null>(null);

// In reset():
preselectedModelId.value = defaults.preselectedModelId;

// In resetChatScopedState():
preselectedModelId.value = defaults.preselectedModelId;

// In return {}:
preselectedModelId,
```

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

Expected: all tests still pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/vue/stores/ui.ts
git commit -m "feat: add preselectedModelId to ui store"
```

---

## Task 3: Rewrite ModelBrowserDialog

**Files:**
- Modify: `src/vue/components/ModelBrowserDialog.vue`

Replace the entire file. Key changes:
- Two-row header: title + ✕ on first row, search input on second row
- `<table>` with sortable columns: Provider | Name | Context | Input /M | Output /M
- Local `sortKey` + `sortDir` state, applied in `filtered` computed
- Updated context options (add 200k and 1M)
- Use `cleanModelName`, `classifyPricing`, `formatContextLength` from utility module

- [ ] **Step 1: Rewrite the component**

```vue
<template>
  <Teleport to="body">
    <div
      class="browser-backdrop"
      @click.self="$emit('close')"
      @keydown.esc.window="$emit('close')"
    >
      <div class="browser-dialog">
        <!-- Title bar -->
        <div class="browser-titlebar">
          <h2 class="browser-title">Select Model</h2>
          <button class="browser-close" @click="$emit('close')" aria-label="Close">✕</button>
        </div>
        <!-- Search bar -->
        <div class="browser-searchbar">
          <UiInput
            v-model="search"
            class="browser-search"
            type="text"
            placeholder="Search by name or provider…"
            autofocus
          />
        </div>
        <div class="browser-body">
          <!-- Sidebar -->
          <aside class="browser-sidebar">
            <div class="browser-sidebar-section">
              <UiCheckbox v-model="freeOnly">Free only</UiCheckbox>
            </div>
            <div class="browser-sidebar-section">
              <div class="browser-sidebar-label">Min context</div>
              <label
                v-for="option in contextOptions"
                :key="option.value"
                class="browser-radio-row"
              >
                <input type="radio" :value="option.value" v-model="minContext" />
                {{ option.label }}
              </label>
            </div>
          </aside>
          <!-- Table -->
          <div class="browser-table-wrap">
            <div v-if="modelsStore.isLoading" class="browser-empty">Loading models…</div>
            <div v-else-if="modelsStore.error" class="browser-error">{{ modelsStore.error }}</div>
            <div v-else-if="!sorted.length" class="browser-empty">No models match your filters.</div>
            <table v-else class="browser-table">
              <thead class="browser-thead">
                <tr>
                  <th
                    v-for="col in columns"
                    :key="col.key"
                    class="browser-th"
                    :class="col.align === 'right' ? 'browser-th-right' : ''"
                    @click="toggleSort(col.key)"
                  >
                    {{ col.label }}
                    <span class="browser-sort-icon">{{ sortIcon(col.key) }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="model in sorted"
                  :key="model.id"
                  class="browser-tr"
                  @click="$emit('select', model.id)"
                >
                  <td class="browser-td browser-td-provider">{{ providerOf(model.id) }}</td>
                  <td class="browser-td browser-td-name">
                    {{ cleanModelName(model.name, model.id) }}
                    <span v-if="pricingOf(model).kind === 'free'" class="browser-badge-free">Free</span>
                  </td>
                  <td class="browser-td browser-td-right">{{ formatContextLength(model.context_length) }}</td>
                  <template v-if="pricingOf(model).kind === 'variable'">
                    <td class="browser-td browser-td-right browser-td-variable" colspan="2">variable</td>
                  </template>
                  <template v-else-if="pricingOf(model).kind === 'free'">
                    <td class="browser-td browser-td-right">—</td>
                    <td class="browser-td browser-td-right">—</td>
                  </template>
                  <template v-else>
                    <td class="browser-td browser-td-right">{{ (pricingOf(model) as any).input }}</td>
                    <td class="browser-td browser-td-right">{{ (pricingOf(model) as any).output }}</td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '../stores/models';
import {
  cleanModelName,
  classifyPricing,
  formatContextLength,
} from '../utils/modelFormatting';
import type { OpenRouterModel } from '../../core';
import UiCheckbox from './ui/UiCheckbox.vue';
import UiInput from './ui/UiInput.vue';

defineEmits<{
  select: [modelId: string];
  close: [];
}>();

const modelsStore = useModelsStore();

const search = ref('');
const freeOnly = ref(false);
const minContext = ref(0);

type SortKey = 'provider' | 'name' | 'context' | 'input' | 'output';
const sortKey = ref<SortKey>('provider');
const sortDir = ref<'asc' | 'desc'>('asc');

const columns: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'provider', label: 'Provider' },
  { key: 'name', label: 'Name' },
  { key: 'context', label: 'Context', align: 'right' },
  { key: 'input', label: 'Input /M', align: 'right' },
  { key: 'output', label: 'Output /M', align: 'right' },
];

const contextOptions = [
  { label: 'Any', value: 0 },
  { label: '≥ 8k', value: 8_000 },
  { label: '≥ 32k', value: 32_000 },
  { label: '≥ 128k', value: 128_000 },
  { label: '≥ 200k', value: 200_000 },
  { label: '≥ 1M', value: 1_000_000 },
];

function providerOf(id: string): string {
  return id.includes('/') ? (id.split('/')[0] ?? id) : id;
}

function pricingOf(model: OpenRouterModel) {
  return classifyPricing(model.pricing?.prompt, model.pricing?.completion, model.id);
}

function sortValue(model: OpenRouterModel, key: SortKey): string | number {
  switch (key) {
    case 'provider': return providerOf(model.id).toLowerCase();
    case 'name': return cleanModelName(model.name, model.id).toLowerCase();
    case 'context': return model.context_length ?? 0;
    case 'input': return parseFloat(model.pricing?.prompt ?? '0') || 0;
    case 'output': return parseFloat(model.pricing?.completion ?? '0') || 0;
  }
}

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
}

function sortIcon(key: SortKey): string {
  if (sortKey.value !== key) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return modelsStore.models.filter((model) => {
    if (freeOnly.value && !model.id.endsWith(':free') && pricingOf(model).kind !== 'free') return false;
    if (minContext.value && model.context_length < minContext.value) return false;
    if (q) {
      const inId = model.id.toLowerCase().includes(q);
      const inName = model.name.toLowerCase().includes(q);
      if (!inId && !inName) return false;
    }
    return true;
  });
});

const sorted = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1;
  const key = sortKey.value;
  return [...filtered.value].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === 'string' && typeof bv === 'string') {
      const diff = av.localeCompare(bv);
      if (diff !== 0) return diff * dir;
      // secondary sort by name when primary is provider
      if (key === 'provider') {
        return cleanModelName(a.name, a.id).localeCompare(cleanModelName(b.name, b.id));
      }
      return 0;
    }
    return ((av as number) - (bv as number)) * dir;
  });
});
</script>

<style scoped>
@reference "../../styles.css";

.browser-backdrop {
  @apply fixed inset-0 z-50 flex items-start justify-center bg-neutral-950/20 pt-16 backdrop-blur-sm;
}

.browser-dialog {
  @apply flex max-h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-neutral-300 bg-white shadow-xl;
}

.browser-titlebar {
  @apply flex items-center justify-between border-b border-neutral-200 px-4 py-2.5;
}

.browser-title {
  @apply text-[13px] font-semibold text-neutral-900;
}

.browser-close {
  @apply flex h-6 w-6 items-center justify-center rounded text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}

.browser-searchbar {
  @apply border-b border-neutral-200 px-4 py-2;
}

.browser-search {
  @apply w-full;
}

.browser-body {
  @apply flex min-h-0 flex-1;
}

.browser-sidebar {
  @apply flex w-40 shrink-0 flex-col gap-4 border-r border-neutral-200 p-4;
}

.browser-sidebar-section {
  @apply flex flex-col gap-2;
}

.browser-sidebar-label {
  @apply text-[10px] font-semibold uppercase tracking-wide text-neutral-400;
}

.browser-radio-row {
  @apply flex cursor-pointer items-center gap-2 font-mono text-[12px] text-neutral-700;
}

.browser-table-wrap {
  @apply flex flex-1 flex-col overflow-y-auto;
}

.browser-empty {
  @apply p-6 text-center font-mono text-[12px] text-neutral-400;
}

.browser-error {
  @apply p-6 text-center font-mono text-[12px] text-red-600;
}

.browser-table {
  @apply w-full border-collapse font-mono text-[12px];
}

.browser-thead {
  @apply sticky top-0 bg-neutral-50;
}

.browser-th {
  @apply cursor-pointer select-none border-b border-neutral-200 px-3 py-2 text-left text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100;
}

.browser-th-right {
  @apply text-right;
}

.browser-sort-icon {
  @apply ml-1 text-neutral-400;
}

.browser-tr {
  @apply cursor-pointer border-b border-neutral-100 hover:bg-neutral-50;
}

.browser-tr:last-child {
  @apply border-b-0;
}

.browser-td {
  @apply px-3 py-2 text-[12px] text-neutral-900;
}

.browser-td-provider {
  @apply text-neutral-400;
}

.browser-td-name {
  @apply font-medium;
}

.browser-td-right {
  @apply text-right text-neutral-500;
}

.browser-td-variable {
  @apply text-right italic text-neutral-400;
}

.browser-badge-free {
  @apply ml-1.5 rounded-sm bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800;
}
</style>
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/ModelBrowserDialog.vue
git commit -m "feat: rewrite ModelBrowserDialog as sortable table"
```

---

## Task 4: Add ✕ close button to HumanNameModal, DeleteAgentModal, SettingsModal

**Files:**
- Modify: `src/vue/components/HumanNameModal.vue`
- Modify: `src/vue/components/DeleteAgentModal.vue`
- Modify: `src/vue/components/SettingsModal.vue`

The pattern for all three: wrap the existing `<h2>` in a flex container with ✕ on the right.

- [ ] **Step 1: Update HumanNameModal.vue**

Replace the existing title:
```html
<h2 class="human-modal-title">Edit human</h2>
```
with:
```html
<div class="human-modal-titlebar">
  <h2 class="human-modal-title">Edit human</h2>
  <button class="human-modal-close" @click="close" aria-label="Close">✕</button>
</div>
```

Add styles:
```css
.human-modal-titlebar {
  @apply flex items-center justify-between;
}

.human-modal-close {
  @apply flex h-6 w-6 items-center justify-center rounded text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}
```

- [ ] **Step 2: Update DeleteAgentModal.vue**

Replace:
```html
<h2 class="delete-agent-modal-title">Hide agent?</h2>
```
with:
```html
<div class="delete-agent-modal-titlebar">
  <h2 class="delete-agent-modal-title">Hide agent?</h2>
  <button class="delete-agent-modal-close" @click="close" aria-label="Close">✕</button>
</div>
```

Add styles:
```css
.delete-agent-modal-titlebar {
  @apply flex items-center justify-between;
}

.delete-agent-modal-close {
  @apply flex h-6 w-6 items-center justify-center rounded text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}
```

- [ ] **Step 3: Update SettingsModal.vue**

Replace:
```html
<h2 class="modal-title">Settings</h2>
```
with:
```html
<div class="modal-titlebar">
  <h2 class="modal-title">Settings</h2>
  <button class="modal-close" @click="close" aria-label="Close">✕</button>
</div>
```

Add styles:
```css
.modal-titlebar {
  @apply flex items-center justify-between;
}

.modal-close {
  @apply flex h-6 w-6 items-center justify-center rounded text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/vue/components/HumanNameModal.vue src/vue/components/DeleteAgentModal.vue src/vue/components/SettingsModal.vue
git commit -m "feat: add close button to HumanNameModal, DeleteAgentModal, SettingsModal"
```

---

## Task 5: Add ✕ to AgentWizard and RequestInspectionModal

**Files:**
- Modify: `src/vue/components/AgentWizard.vue`
- Modify: `src/vue/components/RequestInspectionModal.vue`

- [ ] **Step 1: Update AgentWizard.vue title**

Replace:
```html
<h2 class="wizard-title">
  {{ agent ? 'Edit agent' : 'Create agent' }}
</h2>
```
with:
```html
<div class="wizard-titlebar">
  <h2 class="wizard-title">
    {{ agent ? 'Edit agent' : 'Create agent' }}
  </h2>
  <button class="wizard-close" @click="close" aria-label="Close">✕</button>
</div>
```

Add styles:
```css
.wizard-titlebar {
  @apply flex items-center justify-between;
}

.wizard-close {
  @apply flex h-6 w-6 items-center justify-center rounded text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}
```

- [ ] **Step 2: Update RequestInspectionModal.vue**

The inspection modal already has a header with a "Close" text button (`<UiButton size="sm" @click="inspection.close">Close</UiButton>`). Replace it with a ✕ button to match other modals:

Replace:
```html
<UiButton size="sm" @click="inspection.close">Close</UiButton>
```
with:
```html
<button class="inspection-close" @click="inspection.close" aria-label="Close">✕</button>
```

Add style:
```css
.inspection-close {
  @apply flex h-7 w-7 shrink-0 items-center justify-center self-start rounded text-[14px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/vue/components/AgentWizard.vue src/vue/components/RequestInspectionModal.vue
git commit -m "feat: add close button to AgentWizard and RequestInspectionModal"
```

---

## Task 6: New agent creation flow

**Files:**
- Modify: `src/vue/components/ParticipantsPanel.vue`
- Modify: `src/vue/components/AgentWizard.vue`

- [ ] **Step 1: Update ParticipantsPanel.vue**

Add import of `ModelBrowserDialog` and `useAgentsStore`, add `showModelBrowser` local ref, update `openCreateAgentWizard`:

In `<script setup>`:

```typescript
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAgentsStore } from '../stores/agents';
import { useMessageInputStore } from '../stores/messageInput';
import { useParticipantsStore } from '../stores/participants';
import { useUiStore } from '../stores/ui';
import { useOverlayControls } from '../useOverlayControls';
import ModelBrowserDialog from './ModelBrowserDialog.vue';
import UiButton from './ui/UiButton.vue';

const { participantRows } = storeToRefs(useParticipantsStore());
const ui = useUiStore();
const { isApiKeyPresent } = storeToRefs(useAgentsStore());
const messageInput = useMessageInputStore();
const overlayControls = useOverlayControls();

const showModelBrowser = ref(false);

function openCreateAgentWizard() {
  ui.editingAgentId = null;
  if (!isApiKeyPresent.value) {
    // No API key — open wizard directly so it shows the "go to settings" prompt
    ui.showAgentWizard = true;
    return;
  }
  showModelBrowser.value = true;
}

function onModelSelected(modelId: string) {
  showModelBrowser.value = false;
  ui.preselectedModelId = modelId;
  ui.showAgentWizard = true;
}

function onBrowserClosed() {
  showModelBrowser.value = false;
}

// ... keep existing openParticipantEditor unchanged
```

In `<template>`, add ModelBrowserDialog after the `<section>` tag (but still inside the template — it uses Teleport so position doesn't matter):

```html
<ModelBrowserDialog
  v-if="showModelBrowser"
  @select="onModelSelected"
  @close="onBrowserClosed"
/>
```

- [ ] **Step 2: Update AgentWizard.vue watcher to consume preselectedModelId**

In `src/vue/components/AgentWizard.vue`, update the `watch(() => ui.showAgentWizard, ...)` handler (currently lines 139–146):

```typescript
watch(
  () => ui.showAgentWizard,
  async (isOpen) => {
    if (isOpen && isApiKeyPresent.value) {
      await modelsStore.fetchModels();
    }
    if (isOpen && !agent.value && ui.preselectedModelId) {
      modelId.value = ui.preselectedModelId;
      ui.preselectedModelId = null;
    }
  },
);
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/vue/components/ParticipantsPanel.vue src/vue/components/AgentWizard.vue
git commit -m "feat: open model browser before wizard when creating new agent"
```

---

## Task 7: Smoke test in browser

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Verify model browser**

1. Click "Add" in the Participants panel (with API key set)
2. ModelBrowserDialog opens immediately — no wizard
3. Table shows Provider | Name | Context | Input /M | Output /M columns
4. Click a column header — rows re-sort
5. "Auto Router" shows "variable" in price columns
6. "Free Models Router" shows Free badge and "—" in price columns
7. "Qwen: Qwen Plus 0728" displays as "Qwen Plus 0728"
8. ✕ button closes the dialog
9. After selecting a model, wizard opens with that model pre-filled

- [ ] **Step 3: Verify close buttons on all modals**

Open each modal and confirm ✕ button is present in the title row and closes the modal:
- AgentWizard (Edit agent / Create agent)
- HumanNameModal (Edit human)
- DeleteAgentModal (Hide agent?)
- SettingsModal (Settings)
- RequestInspectionModal (click a message → inspect)
- ModelBrowserDialog (Select Model)

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: address smoke test issues"
```
