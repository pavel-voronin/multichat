<template>
  <header class="playground-toolbar">
    <UiButton
      class="toolbar-button"
      variant="danger"
      size="md"
      @click="session.resetAgentHistoryContext()"
    >
      Add context cut-off
    </UiButton>
    <UiButton class="toolbar-button" size="md" @click="session.toggleContextCutoffs">
      {{ preferences.showContextCutoffs ? 'Hide borders' : 'Show borders' }}
    </UiButton>
    <UiButton class="toolbar-button" size="md" @click="session.cycleCostDisplayMode">
      {{
        preferences.costDisplayMode === 'off'
          ? 'Cost: off'
          : preferences.costDisplayMode === 'request'
            ? 'Cost: request'
            : 'Cost: net'
      }}
    </UiButton>
    <UiButton class="toolbar-button" size="md" @click="session.toggleSilentDecisions">
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
        :disabled="!state.execution.isSweepRunning"
        @click="session.stop()"
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
import { usePreferencesStore } from '../stores/preferences';
import { useRuntimeStore } from '../stores/runtime';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import UiButton from './ui/UiButton.vue';

const session = useSessionStore();
const preferences = usePreferencesStore();
const { state } = storeToRefs(useRuntimeStore());
const ui = useUiStore();
</script>

<style scoped>
@reference "../../styles.css";

.playground-toolbar {
  @apply flex min-h-0 w-full items-center gap-2 bg-transparent px-3 py-1.5;
}

.toolbar-button {
  @apply inline-flex items-center;
}

.toolbar-actions {
  @apply ml-auto flex items-center gap-2;
}
</style>
