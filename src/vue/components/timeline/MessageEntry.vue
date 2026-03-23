<template>
  <article
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <ChatMessageLine :message="entry.message" :muted="entry.isMuted" />
  </article>
</template>

<script setup lang="ts">
import type { VisibleTimelineMessageEntry } from '../../types';
import ChatMessageLine from './ChatMessageLine.vue';

const props = defineProps<{
  entry: VisibleTimelineMessageEntry;
  dragPreviewTargetId: string | null | undefined;
}>();
</script>

<style scoped>
@reference "../../../styles.css";

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
