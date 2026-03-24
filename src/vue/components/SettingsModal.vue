<template>
  <UiModal :open="ui.showSettings" size="md" @close="close">
    <template #title>
      <h2 class="modal-title">Settings</h2>
    </template>

    <label class="modal-field">
      <span class="modal-label-row">
        <span class="modal-label">OpenRouter API key</span>
        <a
          href="https://pavelvoronin.com/openrouter-api-key"
          class="modal-help-link"
          target="_blank"
          rel="noreferrer"
        >
          How to get it
        </a>
      </span>
      <UiInput
        v-model="draftKey"
        class="modal-input"
        type="password"
        placeholder="sk-or-v1-..."
      />
    </label>
    <div class="modal-field">
      <span class="modal-label">Models cache</span>
      <p class="modal-copy">{{ modelsCacheLabel }}</p>
      <UiButton class="modal-secondary-button" @click="invalidateModelsCache">
        Invalidate models cache
      </UiButton>
    </div>
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
      <UiButton class="modal-secondary-button" @click="reset">
        Full reset
      </UiButton>
      <UiButton class="modal-secondary-button" @click="close"> Close </UiButton>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { AgentConfig } from '../../core';
import { useRuntimeStore } from '../stores/runtime';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { useModelsStore } from '../stores/models';
import TurnOrderingSettings from './TurnOrderingSettings.vue';
import UiButton from './ui/UiButton.vue';
import UiInput from './ui/UiInput.vue';
import UiModal from './ui/UiModal.vue';

const session = useSessionStore();
const runtimeStore = useRuntimeStore();
const { state, workspace } = storeToRefs(runtimeStore);
const ui = useUiStore();
const modelsStore = useModelsStore();
const draftKey = ref(state.value.settings.openRouterApiKey);
const draftTurnOrdering = ref(state.value.turnOrdering);
const activeAgents = computed<AgentConfig[]>(() =>
  state.value.agents.filter(
    (agent) => agent.isEnabled !== false && agent.isHidden !== true,
  ),
);
const modelsCacheLabel = computed(() => {
  const snapshot = workspace.value.modelsCatalogSnapshot;
  if (!snapshot) {
    return 'No persisted models snapshot.';
  }

  return `Snapshot: ${snapshot.models.length} models, updated ${new Date(snapshot.lastFetchedAt).toLocaleString()}.`;
});

watch(
  () => ui.showSettings,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    draftKey.value = state.value.settings.openRouterApiKey;
    draftTurnOrdering.value = state.value.turnOrdering;
  },
);

function close() {
  ui.showSettings = false;
}

function save() {
  const nextKey = draftKey.value.trim();
  session.updateRuntimeSettings({
    openRouterApiKey: nextKey,
  });
  session.updateTurnOrdering(draftTurnOrdering.value);
  close();
}

function invalidateModelsCache() {
  modelsStore.invalidateCache();
}

function reset() {
  session.resetRuntime();
  ui.reopenAgentWizardAfterSettings = false;
  close();
}
</script>

<style scoped>
@reference "../../styles.css";

.modal-title {
  @apply m-0 text-base font-semibold;
}

.modal-field {
  @apply mt-4 grid gap-2 px-5;
}

.modal-label-row {
  @apply flex items-center gap-2;
}

.modal-label {
  @apply text-[12px] text-neutral-600;
}

.modal-help-link {
  @apply shrink-0 text-[12px] text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 hover:decoration-neutral-500;
}

.modal-actions {
  @apply mt-5 flex flex-wrap gap-2 px-5 pb-5;
}

.modal-copy {
  @apply m-0 text-[12px] leading-5 text-neutral-500;
}
</style>
