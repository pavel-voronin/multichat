<template>
  <div class="chat-line" :class="lineClasses">
    <span
      class="chat-line-time"
      :class="timeClasses"
      role="button"
      tabindex="0"
      @click="handleInspect"
      @keydown.enter="handleInspect"
      @keydown.space.prevent="handleInspect"
      >[{{ timeLabel }}]</span
    ><template v-if="!isSystem"
      >{{ ' ' }}<span
      class="chat-line-sender"
      :class="{ 'chat-line-sender-interactive': interactive }"
      @dblclick="handleMention"
      >{{ authorLabel }}</span></template
    ><template v-if="showCost"
      >{{ ' ' }}<CostBadge
        :item="message"
        :item-id="message.id"
        :cost-display-mode="costDisplayMode"
      /></template
    >{{ ' ' }}<span class="chat-line-text">{{ message.content }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '../../../core';
import { useInspectionStore } from '../../stores/inspection';
import { useMessageInputStore } from '../../stores/messageInput';
import { usePreferencesStore } from '../../stores/preferences';
import { useTimelineStore } from '../../stores/timeline';
import {
  formatMessageAuthor,
  formatMessageTime,
  isSystemMessage,
} from '../../utils/chatFormatting';
import { shouldShowMessageCost } from '../../utils/costing';
import CostBadge from './CostBadge.vue';

const props = withDefaults(
  defineProps<{
    message: ChatMessage;
    muted?: boolean;
    interactive?: boolean;
  }>(),
  {
    muted: false,
    interactive: true,
  },
);

const inspection = useInspectionStore();
const messageInput = useMessageInputStore();
const preferences = usePreferencesStore();
const timeline = useTimelineStore();

const isSystem = computed(() => isSystemMessage(props.message));
const timeLabel = computed(() => formatMessageTime(props.message.createdAt));
const costDisplayMode = computed(() => preferences.costDisplayMode);
const showCost = computed(() =>
  shouldShowMessageCost(props.message, costDisplayMode.value),
);

const authorLabel = computed(() =>
  formatMessageAuthor(props.message, {
    byId: timeline.participantNameById,
  }),
);

const canInspect = computed(() =>
  props.interactive && inspection.canInspectMessage(props.message),
);

const lineClasses = computed(() => ({
  'chat-line-private': props.message.target === 'private',
  'chat-line-system': isSystem.value,
  'chat-line-muted': props.muted,
}));

const timeClasses = computed(() => ({
  'chat-line-time-active': canInspect.value,
}));

function handleInspect(event?: Event): void {
  if (!canInspect.value) return;
  event?.stopPropagation();
  inspection.openForMessage(props.message.id);
}

function handleMention(event: MouseEvent): void {
  if (!props.interactive || isSystem.value) return;
  event.stopPropagation();
  messageInput.mentionMessageSender(props.message);
}
</script>

<style scoped>
@reference "../../../styles.css";

.chat-line {
  @apply block break-words text-[13px] leading-6 text-neutral-800;
}

.chat-line-private {
  @apply italic text-orange-700;
}

.chat-line-system {
  @apply text-neutral-600;
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
</style>
