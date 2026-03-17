<template>
  <CostBreakdownBubble
    :message="hoveredCostMessage"
    :placement="costBubblePlacement"
    :style="costBubbleStyle"
    :title="costBubbleTitle"
    :cost-display-mode="state.settings.costDisplayMode"
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useChatViewModel } from '../composables/useChatViewModel';
import { useRuntime } from '../useRuntime';
import { useRuntimeState } from '../useRuntimeState';
import { formatMessageAuthor } from '../utils/chatFormatting';
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
const runtime = useRuntime();
const state = useRuntimeState(runtime);
const chatViewModel = useChatViewModel({
  state,
  runtime,
  onParticipantDblClick: () => {},
});
const agents = chatViewModel.agents;
const visibleMessages = chatViewModel.visibleMessages;

const costBubbleStyle = costBubble.bubbleStyle;
const costBubblePlacement = costBubble.bubblePlacement;
const modelPriceBubbleStyle = modelPriceBubble.bubbleStyle;
const modelPriceBubblePlacement = modelPriceBubble.bubblePlacement;

const hoveredCostMessage = computed(
  () =>
    visibleMessages.value.find((message) => message.id === costBubble.hoveredId.value) ??
    null,
);
const hoveredModelAgent = computed(
  () => agents.value.find((agent) => agent.id === modelPriceBubble.hoveredId.value) ?? null,
);

const costRequest = computed(() =>
  hoveredCostMessage.value ? requestMessageCost(hoveredCostMessage.value) : 0,
);
const costOwnPrompt = computed(() =>
  hoveredCostMessage.value ? ownPromptMessageCost(hoveredCostMessage.value) : 0,
);
const costDownstream = computed(() =>
  hoveredCostMessage.value ? downstreamMessageCost(hoveredCostMessage.value) : 0,
);
const costSummaryClass = computed(() =>
  hoveredCostMessage.value
    ? messageCostSummaryClass(
        hoveredCostMessage.value,
        state.value.settings.costDisplayMode,
      )
    : 'message-cost-request',
);
const costShownText = computed(() =>
  formatMessageCost(
    hoveredCostMessage.value
      ? displayedMessageCost(
          hoveredCostMessage.value,
          state.value.settings.costDisplayMode,
        )
      : 0,
  ),
);
const costContributors = computed(() =>
  (hoveredCostMessage.value?.downstreamPromptCostContributors ?? []).map(
    (contributor) => ({
      agentId: contributor.agentId,
      agentName:
        state.value.participants.find(
          (participant) => participant.id === contributor.agentId,
        )
          ?.name ?? contributor.agentId,
      promptCostUsd: contributor.promptCostUsd,
      listenCount: contributor.listenCount,
    }),
  ),
);
const costTotalListenCount = computed(() =>
  costContributors.value.reduce((sum, contributor) => sum + contributor.listenCount, 0),
);
const costBubbleTitle = computed(() => {
  if (!hoveredCostMessage.value) {
    return '';
  }

  if (state.value.settings.costDisplayMode === 'request') {
    return 'Outgoing request cost';
  }

  return `Net cost for ${formatMessageAuthor(hoveredCostMessage.value, {
    byId: (participantId: string) =>
      state.value.participants.find((participant) => participant.id === participantId)?.name ??
      null,
  })}`;
});

const modelPromptPrice = computed(() => agentPromptPrice(hoveredModelAgent.value));
const modelCompletionPrice = computed(() =>
  agentCompletionPrice(hoveredModelAgent.value),
);

watch(
  () => visibleMessages.value.length,
  () => {
    costBubble.updatePosition();
    modelPriceBubble.updatePosition();
  },
);

onMounted(() => {
  window.addEventListener('resize', costBubble.updatePosition);
  window.addEventListener('scroll', costBubble.updatePosition, true);
  window.addEventListener('resize', modelPriceBubble.updatePosition);
  window.addEventListener('scroll', modelPriceBubble.updatePosition, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', costBubble.updatePosition);
  window.removeEventListener('scroll', costBubble.updatePosition, true);
  window.removeEventListener('resize', modelPriceBubble.updatePosition);
  window.removeEventListener('scroll', modelPriceBubble.updatePosition, true);
});

function openCostBubble(messageId: string, event: MouseEvent) {
  costBubble.open(messageId, event);
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

defineExpose({
  openCostBubble,
  scheduleCostBubbleClose,
  cancelCostBubbleClose,
  closeCostBubble,
  openModelPriceBubble,
  scheduleModelPriceBubbleClose,
  cancelModelPriceBubbleClose,
  closeModelPriceBubble,
});
</script>
