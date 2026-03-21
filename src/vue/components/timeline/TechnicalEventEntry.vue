<template>
  <article
    :class="entryClasses"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <button
      type="button"
      class="message-time message-time-trigger"
      :class="{ 'message-time-trigger-active': canInspect }"
      :disabled="!canInspect"
      @click="handleInspect"
    >[{{ formatMessageTime(entry.event.createdAt) }}]</button><span class="message-separator">{{ ' ' }}</span
    ><span class="runtime-label">{{ eventLabel }}</span><CostBadge
      :item="entry.event"
      :item-id="entry.event.id"
      :cost-display-mode="costDisplayMode"
    /><span class="message-separator">{{ ' ' }}</span
    ><span class="runtime-text">{{ eventText }}</span>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CostDisplayMode, VisibleTimelineTechnicalEventEntry } from '../../types';
import { useInspectionStore } from '../../stores/inspection';
import { useTimelineStore } from '../../stores/timeline';
import {
  formatMessageTime,
  formatTechnicalEventLabel,
  formatTechnicalEventText,
  technicalEventClasses,
} from '../../utils/chatFormatting';
import CostBadge from './CostBadge.vue';

const props = defineProps<{
  entry: VisibleTimelineTechnicalEventEntry;
  dragPreviewTargetId: string | null | undefined;
  costDisplayMode: CostDisplayMode;
}>();

const inspection = useInspectionStore();
const timeline = useTimelineStore();

const canInspect = computed(() => timeline.canInspectEvent(props.entry.event));

const entryClasses = computed(() => technicalEventClasses(props.entry.event));

const eventLabel = computed(() =>
  formatTechnicalEventLabel(props.entry.event, { byId: timeline.participantNameById }),
);

const eventText = computed(() => formatTechnicalEventText(props.entry.event));

function handleInspect() {
  if (!props.entry.event.sourceTraceId) return;
  inspection.openForTrace(props.entry.event.sourceTraceId);
}
</script>

<style scoped>
@reference "../../../styles.css";

.runtime-line {
  @apply block break-words text-[13px] leading-6;
}

.runtime-line-silent {
  @apply text-sky-800;
}

.runtime-line-error {
  @apply text-red-800;
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

.runtime-label {
  @apply font-semibold text-sky-900;
}

.runtime-line-error .runtime-label {
  @apply text-red-900;
}

.message-separator {
  @apply whitespace-pre;
}

.runtime-text {
  @apply whitespace-pre-wrap text-current;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
