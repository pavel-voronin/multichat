<template>
  <Teleport to="body">
    <div v-if="ui.showSettings" class="modal-backdrop" @click.self="close">
      <div class="modal-card">
        <h2 class="modal-title">Settings</h2>

        <label class="modal-field">
          <span class="modal-label">OpenRouter API key</span>
          <UiInput
            v-model="draftKey"
            class="modal-input"
            type="password"
            placeholder="sk-or-v1-..."
          />
        </label>

        <label class="modal-field">
          <span class="modal-label">Default history window</span>
          <UiInput
            v-model.number="draftDefaultContextWindowSize"
            class="modal-input"
            type="number"
            min="1"
            step="1"
          />
          <span class="modal-copy">
            Affects the actual agent prompt context and the optional red cutoff
            preview in chat.
          </span>
        </label>

        <div class="modal-actions">
          <UiButton class="modal-primary-button" variant="primary" @click="save">
            Save
          </UiButton>
          <UiButton
            class="modal-secondary-button"
            @click="reset"
          >
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
import { ref, watch } from 'vue';
import { useRuntime } from '../useRuntime';
import { useRuntimeState } from '../useRuntimeState';
import { useUiState } from '../useUiState';
import UiButton from './ui/UiButton.vue';
import UiInput from './ui/UiInput.vue';

const runtime = useRuntime();
const state = useRuntimeState(runtime);
const ui = useUiState();
const draftKey = ref(state.value.settings.openRouterApiKey);
const draftDefaultContextWindowSize = ref(
  state.value.settings.defaultContextWindowSize,
);

watch(
  () => ui.showSettings,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    draftKey.value = state.value.settings.openRouterApiKey;
    draftDefaultContextWindowSize.value =
      state.value.settings.defaultContextWindowSize;
  },
);

function close() {
  ui.showSettings = false;
}

function save() {
  runtime.updateSettings({
    openRouterApiKey: draftKey.value.trim(),
    defaultContextWindowSize: Math.max(
      1,
      Math.floor(draftDefaultContextWindowSize.value || 1),
    ),
  });
  close();
}

function reset() {
  runtime.reset();
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

.modal-title {
  @apply m-0 text-base font-semibold;
}

.modal-field {
  @apply mt-4 grid gap-2;
}

.modal-label {
  @apply text-[12px] text-neutral-600;
}

.modal-actions {
  @apply mt-5 flex flex-wrap gap-2;
}

.modal-copy {
  @apply text-[12px] text-neutral-500;
}

</style>
