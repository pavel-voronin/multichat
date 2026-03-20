<template>
  <Teleport to="body">
    <div
      v-if="ui.showDeleteAgentConfirm"
      class="delete-agent-modal-backdrop"
      @click.self="close"
    >
      <div class="delete-agent-modal-card">
        <h2 class="delete-agent-modal-title">Hide agent?</h2>
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
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAgentsStore } from '../stores/agents';
import { useUiStore } from '../stores/ui';
import UiButton from './ui/UiButton.vue';

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

.delete-agent-modal-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/20 p-6 backdrop-blur-sm;
}

.delete-agent-modal-card {
  @apply w-full max-w-md rounded-md border border-neutral-300 bg-white p-5 font-mono text-[13px] text-neutral-900 shadow-xl;
}

.delete-agent-modal-title {
  @apply m-0 text-base font-semibold;
}

.delete-agent-modal-copy {
  @apply mt-3 text-[12px] leading-5 text-neutral-600;
}

.delete-agent-modal-actions {
  @apply mt-5 flex gap-2;
}
</style>
