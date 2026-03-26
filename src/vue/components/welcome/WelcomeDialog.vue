<template>
  <UiModal :open="ui.showWelcomeModal" size="md" @close="close">
    <template #title>
      <h2 class="welcome-title">Welcome to Multichat</h2>
    </template>

    <div class="welcome-body">
      <div class="welcome-key-section">
        <label class="welcome-key-label">
          <span class="welcome-label-row">
            <span class="welcome-label-text">OpenRouter API key</span>
            <a
              href="https://pavelvoronin.com/openrouter-api-key"
              class="welcome-help-link"
              target="_blank"
              rel="noreferrer"
            >How to get it</a>
          </span>
          <div class="welcome-key-row">
            <UiInput
              v-model="draftKey"
              class="welcome-key-input"
              type="password"
              placeholder="sk-or-v1-..."
              :disabled="isConnecting"
              @keydown.enter="connect"
            />
            <UiButton
              class="welcome-connect-button"
              variant="primary"
              :disabled="!draftKey.trim() || isConnecting"
              @click="connect"
            >
              {{ isConnecting ? 'Connecting...' : 'Connect' }}
            </UiButton>
          </div>
          <p v-if="connectError" class="welcome-error">{{ connectError }}</p>
          <p class="welcome-privacy-note">
            Your key is stored locally in your browser and only sent to OpenRouter.
          </p>
        </label>
      </div>

      <div class="welcome-divider" />

      <div class="welcome-presets-section">
        <span class="welcome-section-label">Or jump right in</span>
        <div class="welcome-cards-row">
          <div
            v-for="preset in WELCOME_PRESETS"
            :key="preset.id"
            :class="['welcome-preset-card', { 'welcome-preset-card--disabled': !isConnected }]"
          >
            <div class="welcome-card-title">{{ preset.title }}</div>
            <div class="welcome-card-meta">{{ preset.agents.length }} agents</div>
            <UiSelect
              v-model="selectedModelId[preset.id]"
              class="welcome-model-select"
              :disabled="!isConnected"
            >
              <option value="" disabled>Choose model...</option>
              <option
                v-for="model in modelsStore.models"
                :key="model.id"
                :value="model.id"
              >
                {{ model.name }}
              </option>
            </UiSelect>
            <UiButton
              class="welcome-launch-button"
              variant="primary"
              :disabled="!isConnected || !selectedModelId[preset.id]"
              @click="launch(preset)"
            >
              Launch
            </UiButton>
          </div>

          <div class="welcome-explore-card">
            <div class="welcome-card-title">Start exploring</div>
            <div class="welcome-explore-bullets">
              <span>Create chats with any agents</span>
              <span>Mix models in one conversation</span>
              <span>Control who sees what</span>
            </div>
            <UiButton class="welcome-explore-button" @click="close">
              Start exploring
            </UiButton>
          </div>
        </div>
        <p v-if="!isConnected" class="welcome-locked-hint">
          Connect your API key above to unlock presets
        </p>
      </div>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useModelsStore } from '../../stores/models';
import { useSessionStore } from '../../stores/session';
import { useUiStore } from '../../stores/ui';
import { useRuntimeStore } from '../../stores/runtime';
import UiButton from '../ui/UiButton.vue';
import UiInput from '../ui/UiInput.vue';
import UiModal from '../ui/UiModal.vue';
import UiSelect from '../ui/UiSelect.vue';
import { WELCOME_PRESETS, type WelcomeChatPreset } from './presets';

const ui = useUiStore();
const session = useSessionStore();
const modelsStore = useModelsStore();
const runtime = useRuntimeStore();

const draftKey = ref(runtime.state?.settings.openRouterApiKey ?? '');
const isConnecting = ref(false);
const connectError = ref<string | null>(null);
const selectedModelId = ref<Record<string, string>>(
  Object.fromEntries(WELCOME_PRESETS.map((p) => [p.id, ''])),
);

const isConnected = computed(() => modelsStore.models.length > 0);

watch(
  () => ui.showWelcomeModal,
  (isOpen) => {
    if (!isOpen) return;
    draftKey.value = runtime.state?.settings.openRouterApiKey ?? '';
    connectError.value = null;
    selectedModelId.value = Object.fromEntries(WELCOME_PRESETS.map((p) => [p.id, '']));
  },
);

async function connect(): Promise<void> {
  const key = draftKey.value.trim();
  if (!key || isConnecting.value) return;
  isConnecting.value = true;
  connectError.value = null;
  session.updateRuntimeSettings({ openRouterApiKey: key });
  try {
    await modelsStore.fetchModels({ force: true });
    if (modelsStore.error) {
      connectError.value = modelsStore.error;
    }
  } finally {
    isConnecting.value = false;
  }
}

function launch(preset: WelcomeChatPreset): void {
  const modelId = selectedModelId.value[preset.id];
  if (!modelId) return;
  session.launchPreset(preset, modelId);
}

function close(): void {
  ui.showWelcomeModal = false;
}
</script>

<style scoped>
@reference "@styles";

.welcome-title {
  @apply m-0 text-base font-semibold;
}

.welcome-body {
  @apply flex flex-col gap-0 px-5 pb-5 pt-4;
}

.welcome-key-section {
  @apply flex flex-col gap-3;
}

.welcome-key-label {
  @apply flex flex-col gap-2;
}

.welcome-label-row {
  @apply flex items-center gap-2;
}

.welcome-label-text {
  @apply text-[12px] text-neutral-600;
}

.welcome-help-link {
  @apply text-[12px] text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 hover:decoration-neutral-500;
}

.welcome-key-row {
  @apply flex gap-2;
}

.welcome-key-input {
  @apply flex-1;
}

.welcome-connect-button {
  @apply shrink-0;
}

.welcome-error {
  @apply m-0 text-[12px] text-red-600;
}

.welcome-privacy-note {
  @apply m-0 text-[11px] text-neutral-400;
}

.welcome-divider {
  @apply my-4 border-t border-neutral-200;
}

.welcome-presets-section {
  @apply flex flex-col gap-3;
}

.welcome-section-label {
  @apply text-[11px] uppercase tracking-wider text-neutral-400;
}

.welcome-cards-row {
  @apply grid grid-cols-3 gap-3;
}

.welcome-preset-card {
  @apply flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 transition-opacity;
}

.welcome-preset-card--disabled {
  @apply opacity-40;
}

.welcome-card-title {
  @apply text-[13px] font-semibold;
}

.welcome-card-meta {
  @apply text-[11px] text-neutral-500;
}

.welcome-model-select {
  @apply w-full;
}

.welcome-launch-button {
  @apply w-full;
}

.welcome-explore-card {
  @apply flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3;
}

.welcome-explore-bullets {
  @apply flex flex-col gap-1 text-[11px] leading-relaxed text-neutral-500;
}

.welcome-explore-button {
  @apply mt-auto w-full;
}

.welcome-locked-hint {
  @apply m-0 text-center text-[11px] text-neutral-400;
}
</style>
