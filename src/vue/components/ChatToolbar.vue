<template>
  <header class="playground-toolbar">
    <UiButton class="toolbar-button" size="md" @click="$emit('toggle-cutoffs')">
      {{ showContextCutoffs ? 'Hide borders' : 'Show borders' }}
    </UiButton>
    <UiButton class="toolbar-button" size="md" @click="$emit('toggle-cost-mode')">
      {{
        costDisplayMode === 'off'
          ? 'Cost: off'
          : costDisplayMode === 'request'
            ? 'Cost: request'
          : 'Cost: net'
      }}
    </UiButton>
    <UiButton
      class="toolbar-button"
      size="md"
      @click="$emit('toggle-silent-decisions')"
    >
      {{ showSilentDecisions ? 'Technical info: on' : 'Technical info: off' }}
    </UiButton>
    <UiButton class="toolbar-button" size="md" @click="$emit('toggle-logs')">
      {{ showLogs ? 'Logs: on' : 'Logs: off' }}
    </UiButton>
    <div class="toolbar-actions">
      <UiButton
        class="toolbar-button"
        variant="danger"
        size="md"
        @click="$emit('reset-agents')"
      >
        Reset agents
      </UiButton>
      <UiButton
        class="toolbar-button"
        variant="danger"
        size="md"
        :disabled="!canStop"
        @click="$emit('stop')"
      >
        Stop
      </UiButton>
      <UiButton
        class="toolbar-button"
        size="md"
        @click="$emit('open-settings')"
      >
        Settings
      </UiButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { CostDisplayMode } from '../../core';
import UiButton from './ui/UiButton.vue';

defineProps<{
  showContextCutoffs: boolean;
  costDisplayMode: CostDisplayMode;
  showSilentDecisions: boolean;
  showLogs: boolean;
  canStop: boolean;
}>();

defineEmits<{
  'toggle-cutoffs': [];
  'toggle-cost-mode': [];
  'toggle-silent-decisions': [];
  'toggle-logs': [];
  'reset-agents': [];
  stop: [];
  'open-settings': [];
}>();
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
