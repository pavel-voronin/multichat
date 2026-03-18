<template>
  <header class="playground-toolbar">
    <UiButton class="toolbar-button" size="md" @click="chat.toggleContextCutoffs">
      {{ preferences.showContextCutoffs ? 'Hide borders' : 'Show borders' }}
    </UiButton>
    <UiButton class="toolbar-button" size="md" @click="chat.cycleCostDisplayMode">
      {{
        preferences.costDisplayMode === 'off'
          ? 'Cost: off'
          : preferences.costDisplayMode === 'request'
            ? 'Cost: request'
            : 'Cost: net'
      }}
    </UiButton>
    <UiButton class="toolbar-button" size="md" @click="chat.toggleSilentDecisions">
      {{
        preferences.showSilentDecisions
          ? 'Technical info: on'
          : 'Technical info: off'
      }}
    </UiButton>
    <UiButton
      class="toolbar-button"
      size="md"
      @click="ui.showLogsPanel = !ui.showLogsPanel"
    >
      {{ ui.showLogsPanel ? 'Logs: on' : 'Logs: off' }}
    </UiButton>
    <div class="toolbar-actions">
      <UiButton
        class="toolbar-button"
        variant="danger"
        size="md"
        @click="chat.resetAgentHistoryContext()"
      >
        Reset agents
      </UiButton>
      <UiButton
        class="toolbar-button"
        variant="danger"
        size="md"
        :disabled="!state.execution.isSweepRunning"
        @click="chat.stop()"
      >
        Stop
      </UiButton>
      <UiButton
        class="toolbar-button"
        size="md"
        @click="ui.showSettings = true"
      >
        Settings
      </UiButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useChatStore } from '../stores/chat';
import { useUiStore } from '../stores/ui';
import UiButton from './ui/UiButton.vue';

const chat = useChatStore();
const { preferences, state } = storeToRefs(chat);
const ui = useUiStore();
</script>

<style scoped>
@reference "../../styles.css";

.playground-toolbar {
  @apply flex min-h-0 w-full items-center gap-2 border-x border-b border-neutral-300 bg-toolbar-surface px-3 py-1.5;
  border-top-right-radius: 0.375rem;
}

.toolbar-button {
  @apply inline-flex items-center;
}

.toolbar-actions {
  @apply ml-auto flex items-center gap-2;
}
</style>
