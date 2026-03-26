<template>
  <UiModal :open="ui.showChatSettings" size="md" @close="close">
    <template #title>
      <h2 class="modal-title">Chat settings</h2>
    </template>

    <div class="modal-section">
      <label class="chat-settings-field">
        <span class="chat-settings-label">Max auto-rounds</span>
        <UiInput
          v-model.number="draftMaxAutoRounds"
          class="chat-settings-input"
          type="number"
          min="1"
          step="1"
        />
      </label>
      <p class="chat-settings-description">
        Limits how many automatic agent rounds can run after one triggering
        event. One round means giving each queued agent one turn in order. Lower
        values keep conversations tighter and easier to control. Higher values
        let agents develop a discussion further before stopping automatically.
      </p>
    </div>
    <div class="modal-section">
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
import UiInput from '../ui/UiInput.vue';
import UiModal from '../ui/UiModal.vue';

const session = useSessionStore();
const runtimeStore = useRuntimeStore();
const { state } = storeToRefs(runtimeStore);
const ui = useUiStore();
const draftTurnOrdering = ref(state.value.turnOrdering);
const draftMaxAutoRounds = ref(state.value.maxAutoRounds);
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
    draftMaxAutoRounds.value = state.value.maxAutoRounds;
  },
);

function close(): void {
  ui.showChatSettings = false;
}

function save(): void {
  session.updateMaxAutoRounds(
    Number.isFinite(draftMaxAutoRounds.value)
      ? Math.max(1, Math.floor(draftMaxAutoRounds.value))
      : 1,
  );
  session.updateTurnOrdering(draftTurnOrdering.value);
  close();
}
</script>

<style scoped>
@reference "@styles";

.modal-title {
  @apply m-0 text-base font-semibold;
}

.modal-section {
  @apply mt-4 grid gap-2 px-5;
}

.chat-settings-field {
  @apply grid gap-2;
}

.chat-settings-label {
  @apply text-sm font-medium text-neutral-900;
}

.chat-settings-input {
  @apply w-32;
}

.chat-settings-description {
  @apply m-0 text-sm leading-6 text-neutral-600;
}

.modal-actions {
  @apply mt-5 flex flex-wrap gap-2 px-5 pb-5;
}
</style>
