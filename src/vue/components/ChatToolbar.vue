<template>
  <header class="playground-toolbar">
    <UiButton class="toolbar-button" size="md" @click="toggleContextCutoffs">
      {{ state.settings.showContextCutoffs ? 'Hide borders' : 'Show borders' }}
    </UiButton>
    <UiButton class="toolbar-button" size="md" @click="toggleCostDisplayMode">
      {{
        state.settings.costDisplayMode === 'off'
          ? 'Cost: off'
          : state.settings.costDisplayMode === 'request'
            ? 'Cost: request'
            : 'Cost: net'
      }}
    </UiButton>
    <UiButton class="toolbar-button" size="md" @click="toggleSilentDecisions">
      {{
        state.settings.showSilentDecisions
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
        @click="runtime.resetAgentHistoryContext()"
      >
        Reset agents
      </UiButton>
      <UiButton
        class="toolbar-button"
        variant="danger"
        size="md"
        :disabled="!state.execution.isSweepRunning"
        @click="runtime.stop()"
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
import type { CostDisplayMode } from '../../core';
import { useRuntimeStore } from '../stores/runtime';
import { useUiStore } from '../stores/ui';
import UiButton from './ui/UiButton.vue';

const runtimeStore = useRuntimeStore();
const runtime = runtimeStore.requireRuntime();
const { state } = storeToRefs(runtimeStore);
const ui = useUiStore();

function toggleContextCutoffs() {
  runtime.updateSettings({
    showContextCutoffs: !state.value.settings.showContextCutoffs,
  });
}

function toggleCostDisplayMode() {
  const nextModeByCurrent: Record<CostDisplayMode, CostDisplayMode> = {
    off: 'request',
    request: 'net',
    net: 'off',
  };
  runtime.updateSettings({
    costDisplayMode: nextModeByCurrent[state.value.settings.costDisplayMode],
  });
}

function toggleSilentDecisions() {
  runtime.updateSettings({
    showSilentDecisions: !state.value.settings.showSilentDecisions,
  });
}
</script>

<style scoped>
@reference "../../styles.css";

.playground-toolbar {
  @apply flex min-h-0 w-full items-center gap-2 rounded-md border border-neutral-300 bg-white px-2 py-1.5;
}

.toolbar-button {
  @apply inline-flex items-center;
}

.toolbar-actions {
  @apply ml-auto flex items-center gap-2;
}
</style>
