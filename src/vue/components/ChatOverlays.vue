<template>
  <CostBreakdownBubble
    :message="hoveredCostItem"
    :placement="costBubblePlacement"
    :style="costBubbleStyle"
    :title="costBubbleTitle"
    :cost-display-mode="preferences.costDisplayMode"
    :request-cost="costRequest"
    :own-prompt-cost="costOwnPrompt"
    :downstream-cost="costDownstream"
    :total-listen-count="costTotalListenCount"
    :contributors="costContributors"
    :summary-class="costSummaryClass"
    :shown-cost-text="costShownText"
    :format-message-cost="formatMessageCost"
    :format-contributor-cost="formatContributorCost"
    @mouseenter="cancelCostBubbleClose"
    @mouseleave="closeCostBubble"
    @element-change="costBubbleElementRef = $event"
  />

  <ModelPriceBubble
    :agent="hoveredModelAgent"
    :placement="modelPriceBubblePlacement"
    :style="modelPriceBubbleStyle"
    :prompt-price="modelPromptPrice"
    :completion-price="modelCompletionPrice"
    :format-message-cost="formatMessageCost"
    @mouseenter="cancelModelPriceBubbleClose"
    @mouseleave="closeModelPriceBubble"
    @element-change="modelPriceBubbleElementRef = $event"
  />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { RuntimeEvent } from '../../core';
import { useChatStore } from '../stores/chat';
import type { VisibleTimelineEntry } from '../types';
import { setOverlayControls } from '../useOverlayControls';
import {
  formatMessageAuthor,
  formatTechnicalEventLabel,
} from '../utils/chatFormatting';
import {
  agentCompletionPrice,
  agentPromptPrice,
  displayedMessageCost,
  downstreamMessageCost,
  formatContributorCost,
  formatMessageCost,
  messageCostSummaryClass,
  ownPromptMessageCost,
  requestMessageCost,
} from '../utils/costing';
import { useFloatingHoverBubble } from '../composables/useFloatingHoverBubble';
import CostBreakdownBubble from './CostBreakdownBubble.vue';
import ModelPriceBubble from './ModelPriceBubble.vue';

const costBubbleElementRef = ref<HTMLDivElement | null>(null);
const modelPriceBubbleElementRef = ref<HTMLDivElement | null>(null);
const costBubble = useFloatingHoverBubble(costBubbleElementRef);
const modelPriceBubble = useFloatingHoverBubble(modelPriceBubbleElementRef);
const chat = useChatStore();
const { preferences, state, visibleTimelineEntries } = storeToRefs(chat);
const agents = computed(() => state.value.agents);
const chatTimelineEntries = visibleTimelineEntries;
const visibleMessages = computed(() =>
  chatTimelineEntries.value
    .filter(
      (entry): entry is Extract<VisibleTimelineEntry, { kind: 'message' }> =>
        entry.kind === 'message',
    )
    .map((entry) => entry.message),
);
const visibleCostEvents = computed(() =>
  chatTimelineEntries.value.filter(
    (
      entry,
    ): entry is Extract<VisibleTimelineEntry, { kind: 'technical-event' }> =>
      entry.kind === 'technical-event',
  ),
);

const costBubbleStyle = costBubble.bubbleStyle;
const costBubblePlacement = costBubble.bubblePlacement;
const modelPriceBubbleStyle = modelPriceBubble.bubbleStyle;
const modelPriceBubblePlacement = modelPriceBubble.bubblePlacement;

const hoveredCostMessage = computed(
  () =>
    visibleMessages.value.find(
      (message) => message.id === costBubble.hoveredId.value,
    ) ?? null,
);
const hoveredCostEvent = computed<RuntimeEvent | null>(
  () =>
    visibleCostEvents.value.find(
      (entry) => entry.event.id === costBubble.hoveredId.value,
    )?.event ?? null,
);
const hoveredCostItem = computed(
  () => hoveredCostMessage.value ?? hoveredCostEvent.value,
);
const hoveredModelAgent = computed(
  () =>
    agents.value.find(
      (agent) => agent.id === modelPriceBubble.hoveredId.value,
    ) ?? null,
);

const costRequest = computed(() =>
  hoveredCostItem.value ? requestMessageCost(hoveredCostItem.value) : 0,
);
const costOwnPrompt = computed(() =>
  hoveredCostItem.value ? ownPromptMessageCost(hoveredCostItem.value) : 0,
);
const costDownstream = computed(() =>
  hoveredCostItem.value ? downstreamMessageCost(hoveredCostItem.value) : 0,
);
const costSummaryClass = computed(() =>
  hoveredCostItem.value
    ? messageCostSummaryClass(
        hoveredCostItem.value,
        preferences.value.costDisplayMode,
      )
    : 'message-cost-request',
);
const costShownText = computed(() =>
  formatMessageCost(
    hoveredCostItem.value
      ? displayedMessageCost(
          hoveredCostItem.value,
          preferences.value.costDisplayMode,
        )
      : 0,
  ),
);
const costContributors = computed(() =>
  (hoveredCostItem.value?.downstreamPromptCostContributors ?? []).map(
    (contributor) => ({
      agentId: contributor.agentId,
      agentName:
        state.value.participants.find(
          (participant) => participant.id === contributor.agentId,
        )?.name ?? contributor.agentId,
      promptCostUsd: contributor.promptCostUsd,
      listenCount: contributor.listenCount,
    }),
  ),
);
const costTotalListenCount = computed(() =>
  costContributors.value.reduce(
    (sum, contributor) => sum + contributor.listenCount,
    0,
  ),
);
const costBubbleTitle = computed(() => {
  if (!hoveredCostItem.value) {
    return '';
  }

  if (preferences.value.costDisplayMode === 'request') {
    return 'Outgoing request cost';
  }

  if (hoveredCostEvent.value) {
    return `Net cost for ${formatTechnicalEventLabel(hoveredCostEvent.value, {
      byId: participantNameById,
    })}`;
  }

  return `Net cost for ${formatMessageAuthor(hoveredCostMessage.value!, {
    byId: participantNameById,
  })}`;
});

const modelPromptPrice = computed(() =>
  agentPromptPrice(hoveredModelAgent.value),
);
const modelCompletionPrice = computed(() =>
  agentCompletionPrice(hoveredModelAgent.value),
);

watch(
  () => visibleMessages.value.length + visibleCostEvents.value.length,
  () => {
    costBubble.updatePosition();
    modelPriceBubble.updatePosition();
  },
);

onMounted(() => {
  setOverlayControls({
    openCostBubble,
    scheduleCostBubbleClose,
    openModelPriceBubble,
    scheduleModelPriceBubbleClose,
  });
  window.addEventListener('resize', costBubble.updatePosition);
  window.addEventListener('scroll', costBubble.updatePosition, true);
  window.addEventListener('resize', modelPriceBubble.updatePosition);
  window.addEventListener('scroll', modelPriceBubble.updatePosition, true);
});

onBeforeUnmount(() => {
  setOverlayControls(null);
  window.removeEventListener('resize', costBubble.updatePosition);
  window.removeEventListener('scroll', costBubble.updatePosition, true);
  window.removeEventListener('resize', modelPriceBubble.updatePosition);
  window.removeEventListener('scroll', modelPriceBubble.updatePosition, true);
});

function openCostBubble(messageId: string, event: MouseEvent) {
  costBubble.open(messageId, event);
}

function participantNameById(participantId: string): string | null {
  return (
    state.value.participants.find(
      (participant) => participant.id === participantId,
    )?.name ?? null
  );
}

function scheduleCostBubbleClose() {
  costBubble.scheduleClose();
}

function cancelCostBubbleClose() {
  costBubble.cancelClose();
}

function closeCostBubble() {
  costBubble.close();
}

function openModelPriceBubble(participantId: string, event: MouseEvent) {
  modelPriceBubble.open(participantId, event);
}

function scheduleModelPriceBubbleClose() {
  modelPriceBubble.scheduleClose();
}

function cancelModelPriceBubbleClose() {
  modelPriceBubble.cancelClose();
}

function closeModelPriceBubble() {
  modelPriceBubble.close();
}
</script>
