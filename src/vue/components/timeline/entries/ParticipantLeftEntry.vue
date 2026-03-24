<template>
  <article
    class="entry-article"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <div class="system-line chat-line-system" :class="{ 'chat-line-muted': entry.isMuted }">
      <span class="chat-line-time">[{{ timeLabel }}]</span>{{ ' '
      }}<span class="system-text">{{ entry.participantName }} left the chat</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ParticipantLeftEntry } from '../../../../core';
import { useCutoffDrag } from '../../../composables/useCutoffDrag';
import { formatMessageTime } from '../../../utils/chatFormatting';

const props = defineProps<{ entry: ParticipantLeftEntry & { isMuted: boolean } }>();
const drag = useCutoffDrag();
const dragPreviewTargetId = drag.dragPreviewTargetId;
const timeLabel = computed(() => formatMessageTime(props.entry.createdAt));
</script>

<style scoped>
@reference "../../../../styles.css";

.entry-article {
  @apply relative;
}

.system-line {
  @apply block text-[13px] leading-6 text-neutral-500;
}

.chat-line-time {
  @apply text-neutral-500;
}

.system-text {
  @apply italic;
}

.chat-line-muted {
  @apply opacity-50;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
