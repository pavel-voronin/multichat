<template>
  <article
    class="entry-article"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <div class="chat-line" :class="lineClasses">
      <span
        class="chat-line-time chat-line-time-active"
        role="button"
        tabindex="0"
        @click="handleInspectClick"
        @keydown.enter="handleInspectClick"
        @keydown.space.prevent="handleInspectClick"
        >[{{ timeLabel }}]</span
      >{{ ' '
      }}<span
        class="chat-line-sender chat-line-sender-interactive"
        @dblclick="handleMention"
        >{{ authorLabel }}</span
      ><template v-if="showCost"
        >{{ ' ' }}<CostBadge :item="entry" :item-id="entry.id" :cost-display-mode="costDisplayMode"
      /></template
      >{{ ' ' }}<span class="chat-line-text">{{ entry.content }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ParticipantMessageEntry } from '../../../../core';
import { useCutoffDrag } from '../../../composables/useCutoffDrag';
import { useEntryInspection } from '../../../composables/useEntryInspection';
import { useEntryCost } from '../../../composables/useEntryCost';
import { useMessageInputStore } from '../../../stores/messageInput';
import { useTimelineStore } from '../../../stores/timeline';
import { formatMessageTime, formatParticipantName } from '../../../utils/chatFormatting';
import CostBadge from '../CostBadge.vue';

const props = defineProps<{ entry: ParticipantMessageEntry & { isMuted: boolean } }>();

const drag = useCutoffDrag();
const dragPreviewTargetId = drag.dragPreviewTargetId;
const messageInput = useMessageInputStore();
const timeline = useTimelineStore();

const { handleInspectClick } = useEntryInspection(props.entry);
const { showCost, costDisplayMode } = useEntryCost(props.entry);

const timeLabel = computed(() => formatMessageTime(props.entry.createdAt));
const authorLabel = computed(() =>
  formatParticipantName(
    props.entry.authorId,
    props.entry.target,
    props.entry.recipientId,
    { byId: timeline.participantNameById },
  ),
);
const lineClasses = computed(() => ({
  'chat-line-private': props.entry.target === 'private',
  'chat-line-muted': props.entry.isMuted,
}));

function handleMention(): void {
  messageInput.mentionParticipantById(props.entry.authorId);
}
</script>

<style scoped>
@reference "../../../../styles.css";

.entry-article {
  @apply relative;
}

.chat-line {
  @apply block break-words text-[13px] leading-6 text-neutral-800;
}

.chat-line-private {
  @apply italic text-orange-700;
}

.chat-line-muted {
  @apply text-neutral-500;
}

.chat-line-time {
  @apply inline text-neutral-500;
}

.chat-line-time-active {
  @apply cursor-pointer rounded transition-colors hover:bg-neutral-200/80;
}

.chat-line-sender {
  @apply whitespace-nowrap rounded font-semibold text-neutral-700;
}

.chat-line-sender-interactive {
  @apply cursor-pointer transition-colors hover:bg-neutral-200/80;
}

.chat-line-text {
  @apply text-current;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
