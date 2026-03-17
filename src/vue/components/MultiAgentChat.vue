<template>
  <div class="playground-shell">
    <div class="playground-layout">
      <div class="playground-toolbar-row">
        <ChatToolbar />
      </div>

      <ConversationPanel />

      <aside class="sidebar-column">
        <ParticipantsPanel />
      </aside>

      <LogsPanel class="layout-logs-panel" />
    </div>

    <SettingsModal />

    <HumanNameModal />

    <AgentWizard />

    <DeleteAgentModal />

    <ChatOverlays
      ref="overlaysRef"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, type ComponentPublicInstance, ref } from 'vue';
import {
  createMultiChatRuntime,
  LocalStoragePersistenceAdapter,
  OpenRouterHttpTransport,
  type MultiChatRuntime,
} from '../../core';
import { useMessageComposer } from '../composables/useMessageComposer';
import { provideComposerState } from '../useComposerState';
import { provideOverlayControls } from '../useOverlayControls';
import { provideRuntime } from '../useRuntime';
import { provideUiState } from '../useUiState';
import { useRuntimeState } from '../useRuntimeState';
import AgentWizard from './AgentWizard.vue';
import ChatOverlays from './ChatOverlays.vue';
import ChatToolbar from './ChatToolbar.vue';
import ConversationPanel from './ConversationPanel.vue';
import DeleteAgentModal from './DeleteAgentModal.vue';
import HumanNameModal from './HumanNameModal.vue';
import LogsPanel from './LogsPanel.vue';
import ParticipantsPanel from './ParticipantsPanel.vue';
import SettingsModal from './SettingsModal.vue';

const props = defineProps<{
  runtime?: MultiChatRuntime;
}>();

const runtime =
  props.runtime ??
  createMultiChatRuntime({
    transport: new OpenRouterHttpTransport(),
    storage: new LocalStoragePersistenceAdapter(),
  });
provideRuntime(runtime);

const state = useRuntimeState(runtime);
provideUiState();
const composerElementRef = ref<{ focus: () => void } | null>(null);
const overlaysRef = ref<
  | (ComponentPublicInstance & {
      openCostBubble: (messageId: string, event: MouseEvent) => void;
      scheduleCostBubbleClose: () => void;
      openModelPriceBubble: (participantId: string, event: MouseEvent) => void;
      scheduleModelPriceBubbleClose: () => void;
    })
  | null
>(null);
const messageComposer = useMessageComposer({
  runtime,
  participants: computed(() => state.value.participants),
  human: computed(() =>
    state.value.participants.find((participant) => participant.role === 'human'),
  ),
  composerRef: composerElementRef,
});
const draftMessage = messageComposer.draftMessage;
provideComposerState({
  draftMessage,
  canSend: messageComposer.canSend,
  sendCurrentMessage: messageComposer.sendCurrentMessage,
  mentionMessageSender: messageComposer.handleMessageSenderDblClick,
  mentionParticipantById: (participantId) => {
    const participant = state.value.participants.find(
      (item) => item.id === participantId,
    );
    if (!participant) {
      return;
    }

    messageComposer.handleParticipantDblClick(participant);
  },
  setComposerElement: (element) => {
    composerElementRef.value = element;
  },
});
provideOverlayControls({
  openCostBubble: (messageId, event) =>
    overlaysRef.value?.openCostBubble(messageId, event),
  scheduleCostBubbleClose: () => overlaysRef.value?.scheduleCostBubbleClose(),
  openModelPriceBubble: (participantId, event) =>
    overlaysRef.value?.openModelPriceBubble(participantId, event),
  scheduleModelPriceBubbleClose: () =>
    overlaysRef.value?.scheduleModelPriceBubbleClose(),
});

</script>

<style scoped>
@reference "../../styles.css";

.playground-shell {
  @apply relative isolate h-full min-h-0 overflow-hidden bg-neutral-100 p-2 font-mono text-[13px] text-neutral-900;
}

.playground-layout {
  @apply grid min-h-0 grid-cols-[minmax(0,1fr)_17rem] grid-rows-[auto_minmax(0,1fr)_auto] gap-2;
  height: 100%;
}

.playground-toolbar-row {
  @apply col-span-2 w-full;
}

.sidebar-column {
  @apply grid h-full min-h-0;
}

@media (max-width: 900px) {
  .playground-layout {
    @apply grid-cols-1 grid-rows-[auto_minmax(0,1fr)_12rem_auto];
  }

  .playground-toolbar-row {
    @apply col-span-1;
  }

  :deep(.chat-column) {
    @apply order-2;
  }

  .sidebar-column {
    @apply order-3;
  }

  .layout-logs-panel {
    @apply col-span-1 order-4;
  }
}
</style>
