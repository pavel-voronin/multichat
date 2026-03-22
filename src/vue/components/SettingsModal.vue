<template>
  <Teleport to="body">
    <div v-if="ui.showSettings" class="modal-backdrop" @click.self="close">
      <div class="modal-card">
        <div class="modal-titlebar">
          <h2 class="modal-title">Settings</h2>
          <button class="modal-close" @click="close" aria-label="Close">✕</button>
        </div>

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
        <div class="modal-actions">
          <UiButton
            class="modal-primary-button"
            variant="primary"
            @click="save"
          >
            Save
          </UiButton>
          <UiButton class="modal-secondary-button" @click="reset">
            Full reset
          </UiButton>
          <UiButton class="modal-secondary-button" @click="close">
            Close
          </UiButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';
import { useRuntimeStore } from '../stores/runtime';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import UiButton from './ui/UiButton.vue';
import UiInput from './ui/UiInput.vue';

const session = useSessionStore();
const { state } = storeToRefs(useRuntimeStore());
const ui = useUiStore();
const draftKey = ref(state.value.settings.openRouterApiKey);

watch(
  () => ui.showSettings,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    draftKey.value = state.value.settings.openRouterApiKey;
  },
);

function close() {
  ui.showSettings = false;
}

function save() {
  session.updateRuntimeSettings({
    openRouterApiKey: draftKey.value.trim(),
  });
  close();
}

function reset() {
  session.resetRuntime();
  ui.reopenAgentWizardAfterSettings = false;
  close();
}
</script>

<style scoped>
@reference "../../styles.css";

.modal-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/20 p-6 backdrop-blur-sm;
}

.modal-card {
  @apply w-full max-w-xl rounded-md border border-neutral-300 bg-white p-5 font-mono text-[13px] text-neutral-900 shadow-xl;
}

.modal-titlebar {
  @apply flex items-center justify-between;
}

.modal-title {
  @apply m-0 text-base font-semibold;
}

.modal-close {
  @apply flex h-6 w-6 items-center justify-center rounded text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}

.modal-field {
  @apply mt-4 grid gap-2;
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
  @apply mt-5 flex flex-wrap gap-2;
}
</style>
