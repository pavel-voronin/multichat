<template>
  <template v-if="shouldShow">
    <span class="message-cost">
      <span
        class="message-cost-trigger"
        :class="costClass"
        @mouseenter="overlayControls.openCostBubble(itemId, $event)"
        @mouseleave="overlayControls.scheduleCostBubbleClose()"
        >{{ formattedCost }}</span
      >
    </span>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CostDisplayMode, CostTrackedItem } from '../../types';
import { useOverlayControls } from '../../useOverlayControls';
import {
  displayedMessageCost,
  formatMessageCost,
  messageCostSummaryClass,
  shouldShowMessageCost,
} from '../../utils/costing';

const props = defineProps<{
  item: CostTrackedItem;
  itemId: string;
  costDisplayMode: CostDisplayMode;
}>();

const overlayControls = useOverlayControls();

const shouldShow = computed(() =>
  shouldShowMessageCost(props.item, props.costDisplayMode),
);
const cost = computed(() =>
  displayedMessageCost(props.item, props.costDisplayMode),
);
const formattedCost = computed(() => formatMessageCost(cost.value));
const costClass = computed(() =>
  messageCostSummaryClass(props.item, props.costDisplayMode),
);
</script>

<style scoped>
@reference "../../../styles.css";

.message-cost {
  @apply relative inline;
}

.message-cost-trigger {
  @apply cursor-default rounded;
}

.message-cost-request {
  @apply text-emerald-700;
}

.message-cost-total {
  @apply text-green-800;
}

.message-cost-net {
  @apply text-teal-700;
}
</style>
