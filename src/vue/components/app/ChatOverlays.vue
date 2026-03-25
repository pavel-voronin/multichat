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
    @mouseenter="costBubble.cancelClose"
    @mouseleave="costBubble.close"
    @element-change="costBubbleElementRef = $event"
  />

  <ModelPriceBubble
    :agent="hoveredModelAgent"
    :placement="modelPriceBubblePlacement"
    :style="modelPriceBubbleStyle"
    :prompt-cost="modelPromptCost"
    :completion-cost="modelCompletionCost"
    :total-cost="modelTotalCost"
    :format-message-cost="formatMessageCost"
    @mouseenter="modelPriceBubble.cancelClose"
    @mouseleave="modelPriceBubble.close"
    @element-change="modelPriceBubbleElementRef = $event"
  />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { SilentDecisionEntry, RuntimeErrorEntry } from '../../../core';
import { useFloatingHoverBubble } from '../../composables/useFloatingHoverBubble';
import { useRuntimeStore } from '../../stores/runtime';
import { useTimelineStore } from '../../stores/timeline';
import type { VisibleChatEntry, VisibleTimelineEntry } from '../../types';
import { setOverlayControls } from '../../useOverlayControls';
import { formatParticipantName } from '../../utils/chatFormatting';
import {
  aggregateAgentSpendFromTraces,
  displayedMessageCost,
  downstreamMessageCost,
  formatContributorCost,
  formatMessageCost,
  messageCostSummaryClass,
  ownPromptMessageCost,
  requestMessageCost,
} from '../../utils/costing';
import ModelPriceBubble from '../models/ModelPriceBubble.vue';
import CostBreakdownBubble from '../overlays/CostBreakdownBubble.vue';

const costBubbleElementRef = ref<HTMLDivElement | null>(null);
const modelPriceBubbleElementRef = ref<HTMLDivElement | null>(null);
const costBubble = useFloatingHoverBubble(costBubbleElementRef);
const modelPriceBubble = useFloatingHoverBubble(modelPriceBubbleElementRef);
const timelineStore = useTimelineStore();
const { preferences, visibleTimelineEntries } = storeToRefs(timelineStore);
const { state, diagnostics } = storeToRefs(useRuntimeStore());
const agents = computed(() => state.value.agents);
const chatTimelineEntries = visibleTimelineEntries;
const visibleMessages = computed(() =>
  chatTimelineEntries.value.filter(
    (
      entry,
    ): entry is Extract<VisibleChatEntry, { kind: 'participant-message' }> =>
      entry.kind === 'participant-message',
  ),
);

type VisibleCostEvent = (SilentDecisionEntry | RuntimeErrorEntry) & {
  sortAt: number;
  isMuted: boolean;
};
const visibleCostEvents = computed(() =>
  chatTimelineEntries.value.filter(
    (entry): entry is VisibleCostEvent =>
      entry.kind === 'silent-decision' || entry.kind === 'runtime-error',
  ),
);

const costBubbleStyle = costBubble.bubbleStyle;
const costBubblePlacement = costBubble.bubblePlacement;
const modelPriceBubbleStyle = modelPriceBubble.bubbleStyle;
const modelPriceBubblePlacement = modelPriceBubble.bubblePlacement;

const hoveredCostMessage = computed(
  () =>
    visibleMessages.value.find(
      (entry) => entry.id === costBubble.hoveredId.value,
    ) ?? null,
);
const hoveredCostEvent = computed(
  () =>
    visibleCostEvents.value.find(
      (entry) => entry.id === costBubble.hoveredId.value,
    ) ?? null,
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
const hoveredModelSpend = computed(() =>
  aggregateAgentSpendFromTraces(
    hoveredModelAgent.value?.id,
    Object.values(diagnostics.value.requestTraces ?? {}),
  ),
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
    const ev = hoveredCostEvent.value;
    const agentName = ev.agentId ? participantNameById(ev.agentId) : null;
    const label =
      ev.kind === 'silent-decision'
        ? agentName
          ? `[silent ${agentName}]`
          : '[silent]'
        : agentName
          ? `[error ${agentName}]`
          : '[error]';
    return `Net cost for ${label}`;
  }

  const msg = hoveredCostMessage.value!;
  return `Net cost for ${formatParticipantName(msg.authorId, msg.target, msg.recipientId, { byId: participantNameById })}`;
});

const modelPromptCost = computed(() => hoveredModelSpend.value.promptCostUsd);
const modelCompletionCost = computed(
  () => hoveredModelSpend.value.completionCostUsd,
);
const modelTotalCost = computed(() => hoveredModelSpend.value.totalCostUsd);

watch(
  () => visibleMessages.value.length + visibleCostEvents.value.length,
  () => {
    costBubble.updatePosition();
    modelPriceBubble.updatePosition();
  },
);

onMounted(() => {
  setOverlayControls({
    openCostBubble: costBubble.open,
    scheduleCostBubbleClose: costBubble.scheduleClose,
    openModelPriceBubble: modelPriceBubble.open,
    scheduleModelPriceBubbleClose: modelPriceBubble.scheduleClose,
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

function participantNameById(participantId: string): string | null {
  return (
    state.value.participants.find(
      (participant) => participant.id === participantId,
    )?.name ?? null
  );
}
</script>
