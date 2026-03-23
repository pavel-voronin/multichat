<template>
  <button
    type="button"
    :class="lineClass"
    @click="handleClick"
  >{{ lineText }}</button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '../../../core';
import { useInspectionStore } from '../../stores/inspection';
import {
  formatMessageAuthor,
  formatMessageTime,
} from '../../utils/chatFormatting';

const props = defineProps<{
  message: ChatMessage;
}>();

const inspection = useInspectionStore();

const lineText = computed(() => {
  const time = formatMessageTime(props.message.createdAt);
  const author = formatMessageAuthor(props.message, {
    byId: inspection.participantName,
  });
  return `[${time}] ${author} ${props.message.content}`;
});

const lineClass = computed(() =>
  props.message.target === 'private'
    ? 'inspector-line inspector-line-private'
    : 'inspector-line',
);

function handleClick(): void {
  inspection.navigateTo(props.message.id);
}
</script>

<style scoped>
@reference "../../../styles.css";

.inspector-line {
  @apply block w-full break-words text-left text-[13px] leading-6 text-neutral-800 transition-colors hover:bg-neutral-100/80 rounded px-1 -mx-1;
}

.inspector-line-private {
  @apply italic text-orange-700;
}
</style>
