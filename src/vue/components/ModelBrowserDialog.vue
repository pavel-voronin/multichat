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
                    :class="{ 'browser-th-right': col.align === 'right' }"
                    @click="toggleSort(col.key)"
                  >
                    {{ col.label }}
                    <span class="browser-sort-icon">{{ sortIcon(col.key) }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="{ model, pricing } in sorted"
                  :key="model.id"
                  class="browser-tr"
                  @click="$emit('select', model.id)"
                >
                  <td class="browser-td browser-td-provider">{{ providerOf(model.id) }}</td>
                  <td class="browser-td browser-td-name">
                    {{ cleanModelName(model.name, model.id) }}
                    <span v-if="pricing.kind === 'free'" class="browser-badge-free">Free</span>
                  </td>
                  <td class="browser-td browser-td-right">{{ formatContextLength(model.context_length) }}</td>
                  <template v-if="pricing.kind === 'variable'">
                    <td class="browser-td browser-td-right browser-td-variable" colspan="2">variable</td>
                  </template>
                  <template v-else-if="pricing.kind === 'free'">
                    <td class="browser-td browser-td-right">—</td>
                    <td class="browser-td browser-td-right">—</td>
                  </template>
                  <template v-else>
                    <td class="browser-td browser-td-right">{{ priceInput(pricing) }}</td>
                    <td class="browser-td browser-td-right">{{ priceOutput(pricing) }}</td>
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
import type { OpenRouterModel } from '../../core';
import { useModelsStore } from '../stores/models';
import {
  cleanModelName,
  classifyPricing,
  formatContextLength,
  type PricingDisplay,
} from '../utils/modelFormatting';
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

function priceInput(pricing: PricingDisplay): string {
  return pricing.kind === 'price' ? pricing.input : '—';
}
function priceOutput(pricing: PricingDisplay): string {
  return pricing.kind === 'price' ? pricing.output : '—';
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
    if (freeOnly.value && pricingOf(model).kind !== 'free') return false;
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
  return [...filtered.value]
    .sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (typeof av === 'string' && typeof bv === 'string') {
        const diff = av.localeCompare(bv);
        if (diff !== 0) return diff * dir;
        if (key === 'provider') {
          return cleanModelName(a.name, a.id).localeCompare(cleanModelName(b.name, b.id));
        }
        return 0;
      }
      return ((av as number) - (bv as number)) * dir;
    })
    .map((model) => ({ model, pricing: pricingOf(model) }));
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
  @apply italic text-neutral-400;
}

.browser-badge-free {
  @apply ml-1.5 rounded-sm bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800;
}
</style>
