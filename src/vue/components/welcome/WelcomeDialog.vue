<template>
  <UiModal :open="ui.showWelcomeModal" size="wide" @close="close">
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
              :disabled="isConnectDisabled"
              @click="connect"
            >
              {{ connectButtonLabel }}
            </UiButton>
          </div>
          <p
            v-if="connectError"
            class="welcome-key-feedback-error"
          >
            {{ connectError }}
          </p>
          <p class="welcome-privacy-note">
            Your key is stored locally in your browser and only sent to OpenRouter.
          </p>
        </label>
      </div>

      <div class="welcome-divider" />

      <div class="welcome-presets-section">
        <span class="welcome-section-label">Or jump right in</span>
        <div class="welcome-cards-row">
          <div class="welcome-presets-group">
            <div
              v-for="preset in WELCOME_PRESETS"
              :key="preset.id"
              :class="presetCardClass()"
            >
              <div class="welcome-card-title">{{ preset.title }}</div>
              <div class="welcome-card-agents">
                {{ preset.agents.map((agent) => agent.name).join(' · ') }}
              </div>
              <p class="welcome-card-description">{{ preset.description }}</p>
              <UiButton
                class="welcome-choose-model-button"
                :disabled="!hasVerifiedConnection"
                @click="openModelBrowser(preset.id)"
              >
                {{ selectedModelLabel(preset.id) }}
              </UiButton>
              <UiButton
                class="welcome-launch-button"
                variant="primary"
                :disabled="!hasVerifiedConnection || !selectedModelId[preset.id]"
                @click="launch(preset)"
              >
                Launch
              </UiButton>
            </div>

            <div
              v-if="!hasVerifiedConnection"
              class="welcome-presets-overlay"
            >
              Connect your API key above to unlock presets
            </div>
          </div>

          <div class="welcome-explore-card">
            <div class="welcome-card-title">Fresh Start</div>
            <ul class="welcome-explore-bullets">
              <li class="welcome-explore-bullet">Create chats with any agents</li>
              <li class="welcome-explore-bullet">Mix models in one conversation</li>
              <li class="welcome-explore-bullet">Control who sees what</li>
            </ul>
            <UiButton class="welcome-explore-button" @click="close">
              Start exploring
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <ModelBrowserDialog
      v-if="showModelBrowser"
      @select="onModelSelect"
      @close="closeModelBrowser"
    />
  </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  isOpenRouterApiKeyFormatValid,
} from '../../../core';
import {
  cleanModelName,
} from '../../utils/modelFormatting';
import { useModelsStore } from '../../stores/models';
import { useSessionStore } from '../../stores/session';
import { useUiStore } from '../../stores/ui';
import { useRuntimeStore } from '../../stores/runtime';
import ModelBrowserDialog from '../models/ModelBrowserDialog.vue';
import UiButton from '../ui/UiButton.vue';
import UiInput from '../ui/UiInput.vue';
import UiModal from '../ui/UiModal.vue';
import { WELCOME_PRESETS, type WelcomeChatPreset } from './presets';

const ui = useUiStore();
const session = useSessionStore();
const modelsStore = useModelsStore();
const runtime = useRuntimeStore();

const draftKey = ref(runtime.state?.settings.openRouterApiKey ?? '');
const isConnecting = ref(false);
const connectError = ref<string | null>(null);
const connectedKey = ref(
  modelsStore.models.length
    ? (runtime.state?.settings.openRouterApiKey ?? '').trim()
    : '',
);
const activePresetId = ref<string | null>(null);
const showModelBrowser = ref(false);
const selectedModelId = ref<Record<string, string>>(
  Object.fromEntries(WELCOME_PRESETS.map((preset) => [preset.id, ''])),
);

const isKeyFormatValid = computed(() =>
  isOpenRouterApiKeyFormatValid(draftKey.value),
);
const hasVerifiedConnection = computed(
  () => connectedKey.value.length > 0 && modelsStore.models.length > 0,
);
const isDraftConnected = computed(
  () =>
    draftKey.value.trim().length > 0 &&
    draftKey.value.trim() === connectedKey.value,
);
const isConnectDisabled = computed(
  () =>
    !draftKey.value.trim() ||
    !isKeyFormatValid.value ||
    isConnecting.value ||
    isDraftConnected.value,
);
const connectButtonLabel = computed(() => {
  if (isConnecting.value) {
    return 'Connecting...';
  }

  if (isDraftConnected.value) {
    return 'Verified';
  }

  return 'Connect';
});

watch(
  () => ui.showWelcomeModal,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    draftKey.value = runtime.state?.settings.openRouterApiKey ?? '';
    connectedKey.value = modelsStore.models.length
      ? (runtime.state?.settings.openRouterApiKey ?? '').trim()
      : '';
    connectError.value = null;
    activePresetId.value = null;
    showModelBrowser.value = false;
    selectedModelId.value = Object.fromEntries(
      WELCOME_PRESETS.map((preset) => [preset.id, '']),
    );
  },
);

watch(draftKey, () => {
  connectError.value = null;
});

async function connect(): Promise<void> {
  const key = draftKey.value.trim();
  if (
    !key ||
    !isKeyFormatValid.value ||
    isConnecting.value ||
    isDraftConnected.value
  ) {
    return;
  }

  isConnecting.value = true;
  connectError.value = null;

  try {
    await session.validateOpenRouterApiKey(key);
    session.updateRuntimeSettings({ openRouterApiKey: key });
    await modelsStore.fetchModels({ force: true });
    connectedKey.value = key;
    connectError.value = modelsStore.error;
  } catch (error) {
    connectError.value =
      error instanceof Error
        ? error.message
        : 'Failed to validate OpenRouter API key';
  } finally {
    isConnecting.value = false;
  }
}

function openModelBrowser(presetId: string): void {
  if (!hasVerifiedConnection.value) {
    return;
  }

  activePresetId.value = presetId;
  showModelBrowser.value = true;
}

function closeModelBrowser(): void {
  showModelBrowser.value = false;
  activePresetId.value = null;
}

function onModelSelect(modelId: string): void {
  if (!activePresetId.value) {
    return;
  }

  selectedModelId.value = {
    ...selectedModelId.value,
    [activePresetId.value]: modelId,
  };
  closeModelBrowser();
}

function selectedModelLabel(presetId: string): string {
  const modelId = selectedModelId.value[presetId];
  if (!modelId) {
    return 'Choose model';
  }

  const model = modelsStore.findById(modelId);
  return model ? cleanModelName(model.name, model.id) : modelId;
}

function presetCardClass(): string {
  return hasVerifiedConnection.value
    ? 'welcome-preset-card'
    : 'welcome-preset-card-disabled';
}

function launch(preset: WelcomeChatPreset): void {
  const modelId = selectedModelId.value[preset.id];
  if (!modelId) {
    return;
  }

  session.launchPreset(preset, modelId);
}

function close(): void {
  ui.showWelcomeModal = false;
}
</script>

<style scoped>
@reference "@styles";

.welcome-title {
  @apply m-0 text-lg font-semibold;
}

.welcome-body {
  @apply flex flex-col gap-0 px-6 pb-6 pt-5;
}

.welcome-key-section {
  @apply flex flex-col gap-4;
}

.welcome-key-label {
  @apply flex flex-col gap-3;
}

.welcome-label-row {
  @apply flex items-center gap-2;
}

.welcome-label-text {
  @apply text-[12px] font-medium text-neutral-700;
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
  @apply h-[34px] min-w-28 shrink-0;
}

.welcome-key-feedback-error {
  @apply m-0 text-[12px] text-red-600;
}

.welcome-privacy-note {
  @apply m-0 text-[11px] text-neutral-400;
}

.welcome-divider {
  @apply my-5 border-t border-neutral-200;
}

.welcome-presets-section {
  @apply flex flex-col gap-4;
}

.welcome-section-label {
  @apply text-[11px] uppercase tracking-wider text-neutral-400;
}

.welcome-cards-row {
  @apply grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)];
}

.welcome-presets-group {
  @apply relative grid grid-cols-1 gap-4 md:grid-cols-2;
}

.welcome-presets-overlay {
  @apply absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/75 px-6 text-center text-[12px] font-medium text-neutral-700 backdrop-blur-[1px];
}

.welcome-preset-card {
  @apply flex min-h-56 flex-col gap-2 rounded-xl border border-neutral-200 p-4 transition-opacity;
}

.welcome-preset-card-disabled {
  @apply flex min-h-56 flex-col gap-2 rounded-xl border border-neutral-200 p-4 opacity-40 transition-opacity;
}

.welcome-card-title {
  @apply text-[15px] font-semibold text-neutral-900;
}

.welcome-card-description {
  @apply m-0 text-[13px] leading-5 text-neutral-600;
}

.welcome-card-agents {
  @apply text-[12px] text-neutral-500;
}

.welcome-choose-model-button {
  @apply mt-2 w-full;
}

.welcome-launch-button {
  @apply mt-auto w-full;
}

.welcome-explore-card {
  @apply flex min-h-56 flex-col gap-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4;
}

.welcome-explore-bullets {
  @apply m-0 flex list-disc flex-col gap-2 pl-5 text-[12px] leading-relaxed text-neutral-600;
}

.welcome-explore-bullet {
  @apply pl-1;
}

.welcome-explore-button {
  @apply mt-auto w-full;
}

</style>
