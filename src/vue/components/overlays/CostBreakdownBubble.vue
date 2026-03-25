<template>
  <Teleport to="body">
    <div
      v-if="message"
      ref="bubble"
      class="message-cost-bubble message-cost-bubble-teleported"
      :class="`message-cost-bubble-${placement}`"
      :style="style"
      @mouseenter="$emit('mouseenter')"
      @mouseleave="$emit('mouseleave')"
    >
      <span class="message-cost-bubble-title">
        {{ title }}
      </span>
      <span v-if="requestCost > 0" class="message-cost-row">
        <span class="message-cost-label">Request</span>
        <span class="message-cost-request">{{
          formatMessageCost(requestCost)
        }}</span>
      </span>
      <span
        v-if="costDisplayMode === 'net' && ownPromptCost > 0"
        class="message-cost-row"
      >
        <span class="message-cost-label">Own input</span>
        <span class="message-cost-input"
          >-{{ formatMessageCost(ownPromptCost) }}</span
        >
      </span>
      <span
        v-if="costDisplayMode === 'net' && downstreamCost > 0"
        class="message-cost-row"
      >
        <span class="message-cost-label">Readers ({{ totalListenCount }})</span>
        <span class="message-cost-output"
          >+{{ formatMessageCost(downstreamCost) }}</span
        >
      </span>
      <span
        v-for="contributor in contributors"
        :key="`${message.id}-${contributor.agentId}`"
        class="message-cost-row message-cost-row-contributor"
      >
        <span class="message-cost-label"
          >{{ contributor.agentName }} x{{ contributor.listenCount }}</span
        >
        <span class="message-cost-output">{{
          formatContributorCost(contributor.promptCostUsd)
        }}</span>
      </span>
      <span class="message-cost-row message-cost-row-total">
        <span class="message-cost-label">Shown</span>
        <span :class="summaryClass">{{ shownCostText }}</span>
      </span>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useTemplateRef, watchEffect } from 'vue';
import type { CostDisplayMode, CostTrackedItem } from '../../types';

defineProps<{
  message: (CostTrackedItem & { id: string }) | null;
  placement: 'up' | 'down';
  style: Record<string, string>;
  title: string;
  costDisplayMode: CostDisplayMode;
  requestCost: number;
  ownPromptCost: number;
  downstreamCost: number;
  totalListenCount: number;
  contributors: Array<{
    agentId: string;
    agentName: string;
    promptCostUsd: number;
    listenCount: number;
  }>;
  summaryClass: string;
  shownCostText: string;
  formatMessageCost: (costUsd: number) => string;
  formatContributorCost: (costUsd: number) => string;
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
@reference "@styles";

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

.message-cost-row-contributor {
  @apply text-[10px];
}

.message-cost-row-total {
  @apply mt-1 border-t border-neutral-200 pt-1 font-semibold;
}

.message-cost-label {
  @apply text-neutral-600;
}

.message-cost-request {
  @apply text-emerald-700;
}

.message-cost-input {
  @apply text-green-600;
}

.message-cost-output {
  @apply text-lime-700;
}

.message-cost-total {
  @apply text-green-800;
}

.message-cost-net {
  @apply text-teal-700;
}
</style>
