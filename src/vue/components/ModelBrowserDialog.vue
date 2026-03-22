<template>
  <Teleport to="body">
    <div
      class="browser-backdrop"
      @click.self="$emit('close')"
      @keydown.esc.window="$emit('close')">
      <div class="browser-dialog">
        <div class="browser-header">
          <h2 class="browser-title">Select Model</h2>
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
                <input
                  type="radio"
                  :value="option.value"
                  v-model="minContext"
                />
                {{ option.label }}
              </label>
            </div>
          </aside>
          <!-- List -->
          <div class="browser-list-wrap">
            <div v-if="modelsStore.isLoading" class="browser-empty">
              Loading models…
            </div>
            <div v-else-if="modelsStore.error" class="browser-error">
              {{ modelsStore.error }}
            </div>
            <div v-else-if="!filtered.length" class="browser-empty">
              No models match your filters.
            </div>
            <template v-else>
              <button
                v-for="model in filtered"
                :key="model.id"
                class="browser-row"
                @click="$emit('select', model.id)"
              >
                <div class="browser-row-main">
                  <span class="browser-row-name">{{ model.name }}</span>
                  <span class="browser-row-provider">{{ providerOf(model.id) }}</span>
                </div>
                <div class="browser-row-meta">
                  <span>{{ formatCtx(model.context_length) }}</span>
                  <span v-if="model.id.endsWith(':free')" class="browser-badge-free">Free</span>
                  <span v-else class="browser-row-price">
                    {{ formatPricePerM(model.pricing?.prompt) }} / {{ formatPricePerM(model.pricing?.completion) }}
                  </span>
                </div>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModelsStore } from '../stores/models';
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

const contextOptions = [
  { label: 'Any', value: 0 },
  { label: '≥ 8k', value: 8_000 },
  { label: '≥ 32k', value: 32_000 },
  { label: '≥ 128k', value: 128_000 },
];

function providerOf(id: string): string {
  return id.includes('/') ? (id.split('/')[0] ?? id) : id;
}

function formatCtx(len: number): string {
  if (!len) return '—';
  if (len >= 1_000_000) return `${Math.round(len / 1_000_000)}M`;
  if (len >= 1_000) return `${Math.round(len / 1_000)}k`;
  return String(len);
}

function formatPricePerM(raw: string | undefined): string {
  if (!raw) return '—';
  const perM = parseFloat(raw) * 1_000_000;
  return `$${perM.toFixed(perM < 0.01 ? 4 : 2)}`;
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return modelsStore.models.filter((model) => {
    if (freeOnly.value && !model.id.endsWith(':free')) return false;
    if (minContext.value && model.context_length < minContext.value) return false;
    if (q) {
      const inId = model.id.toLowerCase().includes(q);
      const inName = model.name.toLowerCase().includes(q);
      if (!inId && !inName) return false;
    }
    return true;
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

.browser-header {
  @apply flex items-center gap-3 border-b border-neutral-200 px-4 py-3;
}

.browser-title {
  @apply shrink-0 text-[13px] font-semibold text-neutral-900;
}

.browser-search {
  @apply flex-1;
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

.browser-list-wrap {
  @apply flex flex-1 flex-col overflow-y-auto;
}

.browser-empty {
  @apply p-6 text-center font-mono text-[12px] text-neutral-400;
}

.browser-error {
  @apply p-6 text-center font-mono text-[12px] text-red-600;
}

.browser-row {
  @apply flex w-full cursor-pointer items-center justify-between gap-4 border-b border-neutral-100 px-4 py-2.5 text-left font-mono transition-colors hover:bg-neutral-50;
}

.browser-row:last-child {
  @apply border-b-0;
}

.browser-row-main {
  @apply flex flex-col gap-0.5 overflow-hidden;
}

.browser-row-name {
  @apply truncate text-[12px] font-medium text-neutral-900;
}

.browser-row-provider {
  @apply text-[11px] text-neutral-400;
}

.browser-row-meta {
  @apply flex shrink-0 items-center gap-2 font-mono text-[11px] text-neutral-500;
}

.browser-badge-free {
  @apply rounded-sm bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800;
}

.browser-row-price {
  @apply text-neutral-400;
}
</style>
