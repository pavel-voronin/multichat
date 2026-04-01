<template>
  <article
    class="entry-article"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <div class="runtime-line runtime-line-memory">
      <button
        type="button"
        class="message-time message-time-trigger"
        disabled
      >
        [{{ timeLabel }}]</button
      >{{ ' ' }}<span class="runtime-label">{{ label }}</span
      >{{ ' ' }}<span class="runtime-text">{{ operationText }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AgentMemoryChangedEntry } from '../../../../core';
import { useCutoffDrag } from '../../../composables/useCutoffDrag';
import { useTimelineStore } from '../../../stores/timeline';
import { formatMessageTime } from '../../../utils/chatFormatting';

const props = defineProps<{
  entry: AgentMemoryChangedEntry & { isMuted: boolean };
}>();
const drag = useCutoffDrag();
const dragPreviewTargetId = drag.dragPreviewTargetId;
const timeline = useTimelineStore();
const timeLabel = computed(() => formatMessageTime(props.entry.createdAt));
const label = computed(() => {
  const name = timeline.participantNameById(props.entry.agentId);
  return name ? `[memory ${name}]` : '[memory]';
});
const operationText = computed(() => {
  const { operation, entryId, content } = props.entry;
  if (operation === 'add') return `added #${entryId}: "${content}"`;
  if (operation === 'update') return `updated #${entryId}: "${content}"`;
  return `deleted #${entryId}`;
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

.runtime-line-memory {
  @apply text-violet-800;
}

.runtime-label {
  @apply font-semibold text-violet-900;
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

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
