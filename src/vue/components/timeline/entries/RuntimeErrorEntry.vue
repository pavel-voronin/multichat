<template>
  <article
    class="entry-article"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <div class="runtime-line runtime-line-error">
      <button
        type="button"
        class="message-time message-time-trigger"
        :class="{ 'message-time-trigger-active': canInspect }"
        :disabled="!canInspect"
        @click="handleInspectClick"
      >
        [{{ timeLabel }}]</button
      >{{ ' ' }}<span class="runtime-label">{{ label }}</span
      ><template v-if="showCost"
        >{{ ' '
        }}<CostBadge
          :item="entry"
          :item-id="entry.id"
          :cost-display-mode="costDisplayMode" /></template
      >{{ ' '
      }}<span class="runtime-text">{{
        entry.details ? `request failed: ${entry.details}` : 'request failed'
      }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RuntimeErrorEntry } from '../../../../core';
import { useCutoffDrag } from '../../../composables/useCutoffDrag';
import { useEntryInspectionByTrace } from '../../../composables/useEntryInspection';
import { useEntryCost } from '../../../composables/useEntryCost';
import { useTimelineStore } from '../../../stores/timeline';
import { formatMessageTime } from '../../../utils/chatFormatting';
import CostBadge from '../CostBadge.vue';

const props = defineProps<{
  entry: RuntimeErrorEntry & { isMuted: boolean };
}>();
const drag = useCutoffDrag();
const dragPreviewTargetId = drag.dragPreviewTargetId;
const timeline = useTimelineStore();
const { canInspect, handleInspectClick } = useEntryInspectionByTrace(
  props.entry,
);
const { showCost, costDisplayMode } = useEntryCost(props.entry);
const timeLabel = computed(() => formatMessageTime(props.entry.createdAt));
const label = computed(() => {
  const name = timeline.participantNameById(props.entry.agentId);
  return name ? `[error ${name}]` : '[error]';
});
</script>

<style scoped>
@reference "@styles";

.entry-article {
  @apply relative;
}

.runtime-line {
  @apply block break-words text-[13px] leading-6;
}

.runtime-line-error {
  @apply text-red-800;
}

.runtime-label {
  @apply font-semibold text-red-900;
}

.runtime-text {
  @apply whitespace-pre-wrap text-current;
}

.message-time {
  @apply text-neutral-500;
}

.message-time-trigger {
  @apply cursor-default border-0 bg-transparent p-0 text-current;
}

.message-time-trigger-active {
  @apply cursor-pointer rounded transition-colors hover:bg-neutral-200/80;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
