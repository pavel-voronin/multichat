<template>
  <div class="turn-ordering-root">
    <label class="turn-ordering-field">
      <span class="turn-ordering-label">Turn ordering</span>
      <UiSelect
        :model-value="modelValue.strategy"
        class="turn-ordering-select"
        @update:model-value="handleStrategyChange"
      >
        <option
          v-for="option in strategyOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </UiSelect>
    </label>

    <div
      v-if="modelValue.strategy === 'keywords'"
      class="turn-ordering-keywords"
    >
      <div
        v-for="agent in activeAgents"
        :key="agent.id"
        class="turn-ordering-keyword-row"
      >
        <span class="turn-ordering-agent-name">{{ agent.name }}</span>
        <UiInput
          :model-value="keywordTextByAgentId[agent.id] ?? ''"
          class="turn-ordering-keyword-input"
          type="text"
          placeholder="bug, frontend, billing"
          @update:model-value="updateKeywords(agent.id, $event)"
        />
      </div>
    </div>

    <div
      v-if="modelValue.strategy === 'manual_order'"
      class="turn-ordering-manual"
    >
      <p class="turn-ordering-copy">Drag active agents to reorder turns.</p>
      <div class="turn-ordering-manual-list">
        <div
          v-for="agent in manualOrderAgents"
          :key="agent.id"
          class="turn-ordering-manual-item"
          :class="{
            'turn-ordering-manual-item-dragging':
              draggingAgentId === agent.id,
          }"
          draggable="true"
          @dragstart="handleDragStart(agent.id, $event)"
          @dragover.prevent="handleDragOver(agent.id)"
          @drop.prevent="handleDrop(agent.id, $event)"
          @dragend="handleDragEnd"
        >
          <span class="turn-ordering-manual-grip">::</span>
          <span class="turn-ordering-manual-name">{{ agent.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AgentConfig, TurnOrderingConfig } from '../../core';
import UiInput from './ui/UiInput.vue';
import UiSelect from './ui/UiSelect.vue';

const modelValue = defineModel<TurnOrderingConfig>({
  required: true,
});

const props = defineProps<{
  activeAgents: AgentConfig[];
}>();

const draggingAgentId = ref<string | null>(null);

const strategyOptions = [
  { value: 'sequential', label: 'Sequential' },
  { value: 'random', label: 'Random' },
  { value: 'cheap_first', label: 'Cheap first' },
  { value: 'expensive_first', label: 'Expensive first' },
  { value: 'keywords', label: 'Keywords' },
  { value: 'manual_order', label: 'Manual order' },
  { value: 'sliding_cycle', label: 'Sliding cycle' },
] as const;

function currentKeywords(): Record<string, string[]> {
  return modelValue.value.strategy === 'keywords'
    ? modelValue.value.keywords
    : {};
}

const keywordTextByAgentId = computed<Record<string, string>>(() => {
  const keywordsByAgentId = currentKeywords();
  const entries = props.activeAgents.map((agent) => [
    agent.id,
    (keywordsByAgentId[agent.id] ?? []).join(', '),
  ] as const);

  return Object.fromEntries(entries);
});

const manualOrderAgents = computed<AgentConfig[]>(() => {
  const activeById = new Map(
    props.activeAgents.map((agent) => [agent.id, agent] as const),
  );
  if (modelValue.value.strategy !== 'manual_order') {
    return props.activeAgents;
  }

  const orderedAgents = modelValue.value.order
    .map((agentId) => activeById.get(agentId))
    .filter((agent): agent is AgentConfig => agent !== undefined);
  const listed = new Set(orderedAgents.map((agent) => agent.id));
  const remainingAgents = props.activeAgents.filter(
    (agent) => !listed.has(agent.id),
  );
  return [...orderedAgents, ...remainingAgents];
});

function handleStrategyChange(strategy: string | number | null): void {
  switch (strategy) {
    case 'cheap_first':
    case 'expensive_first':
    case 'random':
    case 'sequential':
      modelValue.value = { strategy };
      return;
    case 'keywords':
      modelValue.value = { strategy, keywords: buildKeywordsRecord() };
      return;
    case 'manual_order':
      modelValue.value = {
        strategy,
        order: manualOrderAgents.value.map((agent) => agent.id),
      };
      return;
    case 'sliding_cycle':
      modelValue.value = { strategy, offset: 0 };
      return;
  }
}

function buildKeywordsRecord(
  overrides?: Record<string, string[]>,
): Record<string, string[]> {
  const currentKeywordsByAgentId = currentKeywords();
  const baseEntries = props.activeAgents.map((agent) => [
    agent.id,
    currentKeywordsByAgentId[agent.id] ?? [],
  ] as const);

  const keywords: Record<string, string[]> = Object.fromEntries(baseEntries);
  return {
    ...keywords,
    ...overrides,
  };
}

function updateKeywords(
  agentId: string,
  value: string | number | null,
): void {
  const nextKeywords = String(value ?? '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  modelValue.value = {
    strategy: 'keywords',
    keywords: buildKeywordsRecord({
      [agentId]: nextKeywords,
    }),
  };
}

function handleDragStart(agentId: string, event: DragEvent): void {
  draggingAgentId.value = agentId;
  event.dataTransfer?.setData('text/plain', agentId);
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 16, 16);
}

function handleDragOver(targetAgentId: string): void {
  const sourceAgentId = draggingAgentId.value;
  if (!sourceAgentId || sourceAgentId === targetAgentId) {
    return;
  }

  const orderedIds = manualOrderAgents.value.map((agent) => agent.id);
  const sourceIndex = orderedIds.findIndex((agentId) => agentId === sourceAgentId);
  const targetIndex = orderedIds.findIndex((agentId) => agentId === targetAgentId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return;
  }

  const nextOrder = [...orderedIds];
  const [movedAgentId] = nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, movedAgentId!);
  modelValue.value = {
    strategy: 'manual_order',
    order: nextOrder,
  };
}

function handleDrop(targetAgentId: string, event: DragEvent): void {
  if (!draggingAgentId.value) {
    const sourceAgentId = event.dataTransfer?.getData('text/plain');
    if (sourceAgentId) {
      draggingAgentId.value = sourceAgentId;
    }
  }

  handleDragOver(targetAgentId);
  handleDragEnd();
}

function handleDragEnd(): void {
  draggingAgentId.value = null;
}
</script>

<style scoped>
@reference "../../styles.css";

.turn-ordering-root {
  @apply grid gap-3;
}

.turn-ordering-field {
  @apply grid gap-2;
}

.turn-ordering-label {
  @apply text-[12px] text-neutral-600;
}

.turn-ordering-select {
  @apply w-full;
}

.turn-ordering-keywords {
  @apply grid gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3;
}

.turn-ordering-keyword-row {
  @apply grid gap-2;
}

.turn-ordering-agent-name {
  @apply text-[12px] font-medium text-neutral-800;
}

.turn-ordering-keyword-input {
  @apply w-full;
}

.turn-ordering-manual {
  @apply grid gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3;
}

.turn-ordering-copy {
  @apply m-0 text-[12px] leading-5 text-neutral-500;
}

.turn-ordering-manual-list {
  @apply grid gap-2;
}

.turn-ordering-manual-item {
  @apply flex cursor-grab items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900;
}

.turn-ordering-manual-item-dragging {
  @apply opacity-60;
}

.turn-ordering-manual-grip {
  @apply shrink-0 text-[11px] tracking-[0.2em] text-neutral-400;
}

.turn-ordering-manual-name {
  @apply min-w-0 truncate;
}
</style>
