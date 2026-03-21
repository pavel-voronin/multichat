<template>
  <Teleport to="body">
    <div
      v-if="agent"
      ref="bubble"
      class="message-cost-bubble message-cost-bubble-teleported"
      :class="`message-cost-bubble-${placement}`"
      :style="style"
      @mouseenter="$emit('mouseenter')"
      @mouseleave="$emit('mouseleave')"
    >
      <span class="message-cost-bubble-title">
        {{ agent.name }}
      </span>
      <span class="message-cost-row">
        <span class="message-cost-label">Prompt</span>
        <span class="message-cost-request">{{
          formatMessageCost(promptCost)
        }}</span>
      </span>
      <span class="message-cost-row">
        <span class="message-cost-label">Completion</span>
        <span class="message-cost-output">{{
          formatMessageCost(completionCost)
        }}</span>
      </span>
      <span class="message-cost-row message-cost-row-total">
        <span class="message-cost-label">Total</span>
        <span class="message-cost-total">{{
          formatMessageCost(totalCost)
        }}</span>
      </span>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useTemplateRef, watchEffect } from 'vue';
import type { AgentConfig } from '../../core';

defineProps<{
  agent: AgentConfig | null;
  placement: 'up' | 'down';
  style: Record<string, string>;
  promptCost: number;
  completionCost: number;
  totalCost: number;
  formatMessageCost: (costUsd: number) => string;
}>();

const emit = defineEmits<{
  mouseenter: [];
  mouseleave: [];
  'element-change': [element: HTMLDivElement | null];
}>();

const bubbleRef = useTemplateRef<HTMLDivElement>('bubble');

watchEffect(() => {
  emit('element-change', bubbleRef.value ?? null);
});
</script>

<style scoped>
@reference "../../styles.css";

.message-cost-bubble {
  @apply grid min-w-56 gap-1 rounded-md border border-green-900/15 bg-white px-3 py-2 text-[11px] leading-4 text-neutral-800 shadow-lg;
}

.message-cost-bubble-teleported {
  @apply fixed z-50;
}

.message-cost-bubble-up {
  transform-origin: bottom left;
}

.message-cost-bubble-down {
  transform-origin: top left;
}

.message-cost-bubble-title {
  @apply mb-1 font-semibold text-neutral-900;
}

.message-cost-row {
  @apply flex items-start justify-between gap-3;
}

.message-cost-row-total {
  @apply mt-1 border-t border-neutral-200 pt-1;
}

.message-cost-label {
  @apply text-neutral-600;
}

.message-cost-request {
  @apply text-emerald-700;
}

.message-cost-output {
  @apply text-lime-700;
}

.message-cost-total {
  @apply font-semibold text-emerald-800;
}
</style>
