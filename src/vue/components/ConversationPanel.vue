<template>
  <section class="chat-column">
    <div ref="messageLog" class="chat-log" @scroll="updatePinnedState">
      <ChatTimeline />
    </div>

    <ChatComposer
      ref="composer"
      v-model="draftMessage"
      :can-send="composerState.canSend.value"
      @send="composerState.sendCurrentMessage"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch, watchEffect } from 'vue';
import { useComposerState } from '../useComposerState';
import { usePinnedScroll } from '../composables/usePinnedScroll';
import { useRuntime } from '../useRuntime';
import { useRuntimeState } from '../useRuntimeState';
import ChatComposer from './ChatComposer.vue';
import ChatTimeline from './ChatTimeline.vue';

const messageLogRef = useTemplateRef<HTMLDivElement>('messageLog');
const composerRef = useTemplateRef<{ focus: () => void }>('composer');
const messageScroll = usePinnedScroll(messageLogRef);
const runtime = useRuntime();
const state = useRuntimeState(runtime);
const composerState = useComposerState();

const draftMessage = computed({
  get: () => composerState.draftMessage.value,
  set: (value: string) => {
    composerState.draftMessage.value = value;
  },
});

watchEffect(() => {
  composerState.setComposerElement(composerRef.value ?? null);
});

watch(
  () => runtime.getTimelineEntries().length,
  async () => {
    await nextTick();
    messageScroll.scrollToBottomIfPinned();
  },
);

function updatePinnedState() {
  messageScroll.updatePinnedState();
}
</script>

<style scoped>
@reference "../../styles.css";

.chat-column {
  @apply h-full grid min-h-0 grid-rows-[minmax(0,1fr)_auto] rounded-md border border-neutral-300 bg-white;
}

.chat-log {
  @apply min-h-0 overflow-auto px-4 py-3;
}
</style>
