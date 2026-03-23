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
    >
      [{{ formatMessageTime(entry.message.createdAt) }}]</button
    ><template v-if="!isSystem">
      <span class="message-separator">{{ ' ' }}</span
      ><span
        class="message-sender"
        @dblclick="messageInput.mentionMessageSender(entry.message)"
        >{{ authorLabel }}</span
      > </template
    ><CostBadge
      :item="entry.message"
      :item-id="entry.message.id"
      :cost-display-mode="costDisplayMode"
    /><span class="message-separator">{{ ' ' }}</span
    ><span class="message-text">{{ entry.message.content }}</span>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CostDisplayMode, VisibleTimelineMessageEntry } from '../../types';
import { useInspectionStore } from '../../stores/inspection';
import { useMessageInputStore } from '../../stores/messageInput';
import { useTimelineStore } from '../../stores/timeline';
import {
  formatMessageAuthor,
  formatMessageTime,
  isSystemMessage,
} from '../../utils/chatFormatting';
import CostBadge from './CostBadge.vue';

const props = defineProps<{
  entry: VisibleTimelineMessageEntry;
  dragPreviewTargetId: string | null | undefined;
  costDisplayMode: CostDisplayMode;
}>();

const inspection = useInspectionStore();
const messageInput = useMessageInputStore();
const timeline = useTimelineStore();

const isSystem = computed(() => isSystemMessage(props.entry.message));

const authorLabel = computed(() =>
  formatMessageAuthor(props.entry.message, {
    byId: timeline.participantNameById,
  }),
);

const canInspect = computed(() =>
  inspection.canInspectMessage(props.entry.message),
);

const entryClasses = computed(() => {
  const base = isSystem.value
    ? 'message-line-system'
    : props.entry.message.target === 'private'
      ? 'message-line-private'
      : 'message-line';
  return props.entry.isMuted ? `${base} message-line-muted` : base;
});

function handleInspect() {
  inspection.openForMessage(props.entry.message.id);
}
</script>

<style scoped>
@reference "../../../styles.css";

.message-line {
  @apply block break-words text-[13px] leading-6 text-neutral-800;
}

.message-line-private {
  @apply block break-words text-[13px] leading-6 text-orange-700 italic;
}

.message-line-system {
  @apply block break-words text-[13px] leading-6 text-neutral-600;
}

.message-line-muted {
  @apply text-neutral-500;
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

.message-sender {
  @apply whitespace-nowrap rounded font-semibold text-neutral-700 transition-colors hover:bg-neutral-200/80;
}

.message-separator {
  @apply whitespace-pre;
}

.message-text {
  @apply whitespace-pre-wrap text-current;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
