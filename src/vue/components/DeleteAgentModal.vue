<template>
  <UiModal :open="ui.showDeleteAgentConfirm" size="sm" @close="close">
    <template #title>
      <h2 class="delete-agent-modal-title">Hide agent?</h2>
    </template>
    <p class="delete-agent-modal-copy">
      {{ modalCopy }}
    </p>
    <div class="delete-agent-modal-actions">
      <UiButton
        class="delete-agent-modal-primary-button"
        variant="danger"
        @click="confirm"
      >
        Hide and disable
      </UiButton>
      <UiButton class="delete-agent-modal-secondary-button" @click="close">
        Cancel
      </UiButton>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAgentsStore } from '../stores/agents';
import { useUiStore } from '../stores/ui';
import UiButton from './ui/UiButton.vue';
import UiModal from './ui/UiModal.vue';

const agentsStore = useAgentsStore();
const ui = useUiStore();
const modalCopy = computed(() =>
  ui.pendingDeleteAgentName
    ? `Agent "${ui.pendingDeleteAgentName}" will disappear from the sidebar and stop participating in sweeps, but its name will remain in chat history.`
    : 'This agent will disappear from the sidebar and stop participating in sweeps, but its name will remain in chat history.',
);

function close() {
  ui.showDeleteAgentConfirm = false;
  ui.pendingDeleteAgentId = null;
  ui.pendingDeleteAgentName = '';
}

function confirm() {
  if (!ui.pendingDeleteAgentId) {
    close();
    return;
  }

  agentsStore.removeAgent(ui.pendingDeleteAgentId);
  close();
}
</script>

<style scoped>
@reference "../../styles.css";

.delete-agent-modal-title {
  @apply m-0 text-base font-semibold;
}

.delete-agent-modal-copy {
  @apply mt-3 px-5 text-[12px] leading-5 text-neutral-600;
}

.delete-agent-modal-actions {
  @apply mt-5 flex gap-2 px-5 pb-5;
}
</style>
