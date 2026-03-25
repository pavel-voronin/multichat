<template>
  <UiModal :open="ui.showChatSettings" size="md" @close="close">
    <template #title>
      <h2 class="modal-title">Chat settings</h2>
    </template>

    <div class="modal-field">
      <TurnOrderingSettings
        v-model="draftTurnOrdering"
        :active-agents="activeAgents"
      />
    </div>
    <div class="modal-actions">
      <UiButton class="modal-primary-button" variant="primary" @click="save">
        Save
      </UiButton>
      <UiButton class="modal-secondary-button" @click="close"> Close </UiButton>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { AgentConfig } from '../../../core';
import { useRuntimeStore } from '../../stores/runtime';
import { useSessionStore } from '../../stores/session';
import { useUiStore } from '../../stores/ui';
import TurnOrderingSettings from './TurnOrderingSettings.vue';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';

const session = useSessionStore();
const runtimeStore = useRuntimeStore();
const { state } = storeToRefs(runtimeStore);
const ui = useUiStore();
const draftTurnOrdering = ref(state.value.turnOrdering);
const activeAgents = computed<AgentConfig[]>(() =>
  state.value.agents.filter(
    (agent) => agent.isEnabled !== false && agent.isHidden !== true,
  ),
);

watch(
  () => ui.showChatSettings,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    draftTurnOrdering.value = state.value.turnOrdering;
  },
);

function close(): void {
  ui.showChatSettings = false;
}

function save(): void {
  session.updateTurnOrdering(draftTurnOrdering.value);
  close();
}
</script>

<style scoped>
@reference "@styles";

.modal-title {
  @apply m-0 text-base font-semibold;
}

.modal-field {
  @apply mt-4 grid gap-2 px-5;
}

.modal-actions {
  @apply mt-5 flex flex-wrap gap-2 px-5 pb-5;
}
</style>
