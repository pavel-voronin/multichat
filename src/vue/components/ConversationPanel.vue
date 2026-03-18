<template>
  <section class="chat-column">
    <ChatToolbar />

    <div ref="messageLog" class="chat-log" @scroll="updatePinnedState">
      <ChatTimeline />
    </div>

    <ChatComposer
      :key="state.activeTabId"
      ref="messageInput"
      v-model="draftMessageModel"
      :can-send="canSend"
      @send="messageInputState.sendCurrentMessage"
    />
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, nextTick, useTemplateRef, watch, watchEffect } from 'vue';
import { usePinnedScroll } from '../composables/usePinnedScroll';
import { useMessageInputStore } from '../stores/messageInput';
import { useRuntimeStore } from '../stores/runtime';
import ChatComposer from './ChatComposer.vue';
import ChatTimeline from './ChatTimeline.vue';
import ChatToolbar from './ChatToolbar.vue';

const messageLogRef = useTemplateRef<HTMLDivElement>('messageLog');
const messageInputRef = useTemplateRef<{ focus: () => void }>('messageInput');
const messageScroll = usePinnedScroll(messageLogRef);
const runtimeStore = useRuntimeStore();
const { state } = storeToRefs(runtimeStore);
const messageInputState = useMessageInputStore();
const { draftMessage, canSend } = storeToRefs(messageInputState);

const draftMessageModel = computed({
  get: () => draftMessage.value,
  set: (value: string) => {
    draftMessage.value = value;
  },
});

watchEffect(() => {
  messageInputState.setMessageInputElement(messageInputRef.value ?? null);
});

watch(
  () => state.value.timeline.length,
  async () => {
    await nextTick();
    messageScroll.scrollToBottomIfPinned();
  },
  { immediate: true },
);

function updatePinnedState() {
  messageScroll.updatePinnedState();
}
</script>

<style scoped>
@reference "../../styles.css";

.chat-column {
  @apply h-full grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] rounded-bl-md border border-neutral-300 bg-white;
}

.chat-log {
  @apply min-h-0 overflow-auto px-4 py-3;
}
</style>
