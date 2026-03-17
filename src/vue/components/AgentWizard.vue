<template>
  <Teleport to="body">
    <div v-if="ui.showAgentWizard" class="wizard-backdrop" @click.self="close">
      <div class="wizard-card">
        <h2 class="wizard-title">
          {{ agent ? 'Edit agent' : 'Create agent' }}
        </h2>

        <div v-if="!isApiKeyPresent" class="wizard-blocked">
          <p class="wizard-copy">
            OpenRouter key is required before creating agents.
          </p>
          <UiButton class="wizard-primary-button" variant="primary" @click="openSettings">
            Open settings
          </UiButton>
        </div>

        <template v-else>
          <label class="wizard-field">
            <span class="wizard-label">Name</span>
            <UiInput v-model="name" class="wizard-input" type="text" />
          </label>

          <label class="wizard-field">
            <span class="wizard-label">Model</span>
            <UiInput
              v-model="modelSearch"
              class="wizard-input"
              type="text"
              placeholder="Search by provider, model id, or name"
            />
            <UiSelect v-model="modelId" class="wizard-input">
              <optgroup
                v-for="group in groupedModels"
                :key="group.provider"
                :label="group.provider"
              >
                <option
                  v-for="model in group.models"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </option>
              </optgroup>
            </UiSelect>
            <UiCheckbox v-model="showFreeOnly" class="wizard-checkbox">
              Show free models only
            </UiCheckbox>
          </label>

          <p v-if="isLoadingModels" class="wizard-copy">Loading models…</p>
          <p v-else-if="modelsError" class="wizard-error">{{ modelsError }}</p>

          <label class="wizard-field">
            <span class="wizard-label">System prompt</span>
            <div class="wizard-prompt-tools">
              <UiSelect v-model="selectedPresetId" class="wizard-input">
                <option
                  v-for="preset in promptPresets"
                  :key="preset.id"
                  :value="preset.id"
                >
                  {{ preset.label }}
                </option>
              </UiSelect>
              <UiButton class="wizard-secondary-button" @click="applyPreset">
                Apply preset
              </UiButton>
            </div>
            <p class="wizard-copy">
              This prompt is combined with the runtime's built-in protocol
              instructions. Your text defines the agent's role and judgment. The
              app still injects the response contract, visibility rules, and
              tool/JSON command format automatically.
            </p>
            <UiTextarea
              v-model="systemPrompt"
              class="wizard-textarea"
              rows="10"
            />
          </label>

          <label class="wizard-field">
            <span class="wizard-label">History window override</span>
            <UiInput
              v-model.number="contextWindowSize"
              class="wizard-input"
              type="number"
              min="1"
              step="1"
              placeholder="Use global default"
            />
            <p class="wizard-copy">
              Leave empty to use the global default. When set, this agent will
              only receive that many latest visible messages in context.
            </p>
          </label>

          <div class="wizard-actions">
            <UiButton
              class="wizard-primary-button"
              variant="primary"
              :disabled="!name || !modelId || !systemPrompt"
              @click="save"
            >
              Save
            </UiButton>
            <UiButton class="wizard-secondary-button" @click="close">
              Cancel
            </UiButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AgentConfig, OpenRouterModel } from '../../core';
import { defaultPromptPreset, promptPresets } from '../promptPresets';
import { useRuntime } from '../useRuntime';
import { useRuntimeState } from '../useRuntimeState';
import { useUiState } from '../useUiState';
import UiButton from './ui/UiButton.vue';
import UiCheckbox from './ui/UiCheckbox.vue';
import UiInput from './ui/UiInput.vue';
import UiSelect from './ui/UiSelect.vue';
import UiTextarea from './ui/UiTextarea.vue';

const runtime = useRuntime();
const state = useRuntimeState(runtime);
const ui = useUiState();
const agent = computed<AgentConfig | null>(
  () => state.value.agents.find((item) => item.id === ui.editingAgentId) ?? null,
);
const isApiKeyPresent = computed(() =>
  Boolean(state.value.settings.openRouterApiKey),
);

const models = ref<OpenRouterModel[]>([]);
const isLoadingModels = ref(false);
const modelsError = ref('');
const showFreeOnly = ref(false);
const modelSearch = ref('');
const name = ref('');
const modelId = ref('');
const systemPrompt = ref('');
const contextWindowSize = ref<number | null>(null);
const selectedPresetId = ref(defaultPromptPreset.id);

const visibleModels = computed(() => {
  const query = modelSearch.value.trim().toLowerCase();
  return models.value.filter((model) => {
    if (showFreeOnly.value && !model.id.endsWith(':free')) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      model.id.toLowerCase().includes(query) ||
      model.name.toLowerCase().includes(query)
    );
  });
});

const groupedModels = computed(() => {
  const groups = new Map<string, OpenRouterModel[]>();

  for (const model of visibleModels.value) {
    const provider = model.id.includes('/') ? model.id.split('/')[0] : 'other';
    const current = groups.get(provider) ?? [];
    current.push(model);
    groups.set(provider, current);
  }

  return Array.from(groups.entries())
    .map(([provider, providerModels]) => ({
      provider,
      models: [...providerModels].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
});

watch(
  agent,
  (agent) => {
    name.value = agent?.name ?? '';
    modelId.value = agent?.modelId ?? '';
    systemPrompt.value = agent?.systemPrompt ?? defaultPromptPreset.prompt;
    contextWindowSize.value = agent?.contextWindowSize ?? null;
    selectedPresetId.value = defaultPromptPreset.id;
  },
  { immediate: true },
);

watch(
  () => ui.showAgentWizard,
  async (isOpen) => {
    if (isOpen && isApiKeyPresent.value) {
      await loadModels();
    }
  },
);

async function loadModels() {
  isLoadingModels.value = true;
  modelsError.value = '';
  try {
    models.value = await runtime.listModels();
    models.value.sort((left, right) => {
      const leftProvider = left.id.split('/')[0] ?? left.id;
      const rightProvider = right.id.split('/')[0] ?? right.id;
      const providerDiff = leftProvider.localeCompare(rightProvider);
      if (providerDiff !== 0) {
        return providerDiff;
      }

      return left.name.localeCompare(right.name);
    });

    if (!modelId.value && models.value[0]) {
      modelId.value = models.value[0].id;
    }
  } catch (error) {
    modelsError.value =
      error instanceof Error ? error.message : 'Failed to load models';
  } finally {
    isLoadingModels.value = false;
  }
}

function applyPreset() {
  const preset = promptPresets.find(
    (item) => item.id === selectedPresetId.value,
  );
  if (!preset) {
    return;
  }

  systemPrompt.value = preset.prompt;
}

function close() {
  ui.showAgentWizard = false;
}

function save() {
  const selectedModel = models.value.find((model) => model.id === modelId.value);
  const payload = {
    name: name.value.trim(),
    modelId: modelId.value,
    pricing: selectedModel?.pricing ?? agent.value?.pricing,
    systemPrompt: systemPrompt.value.trim(),
    contextWindowSize:
      contextWindowSize.value && contextWindowSize.value > 0
        ? Math.floor(contextWindowSize.value)
        : null,
  };

  if (agent.value?.id) {
    runtime.updateAgent(agent.value.id, payload);
  } else {
    runtime.createAgent({
      ...payload,
      capabilities: {
        prefersTools: true,
        supportsToolUse: 'unknown',
      },
    });
  }

  close();
}

function openSettings() {
  ui.reopenAgentWizardAfterSettings = ui.showAgentWizard;
  ui.showAgentWizard = false;
  ui.showSettings = true;
}

watch(
  () => ui.showSettings,
  (isOpen, wasOpen) => {
    if (isOpen || !wasOpen || !ui.reopenAgentWizardAfterSettings) {
      return;
    }

    ui.reopenAgentWizardAfterSettings = false;
    ui.showAgentWizard = true;
  },
);

onMounted(async () => {
  if (ui.showAgentWizard && isApiKeyPresent.value) {
    await loadModels();
  }
});
</script>

<style scoped>
@reference "../../styles.css";

.wizard-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/20 p-6 backdrop-blur-sm;
}

.wizard-card {
  @apply max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-auto rounded-md border border-neutral-300 bg-white p-5 font-mono text-[13px] text-neutral-900 shadow-xl;
}

.wizard-title {
  @apply m-0 text-base font-semibold;
}

.wizard-blocked {
  @apply mt-4 grid gap-3;
}

.wizard-field {
  @apply mt-4 grid gap-2;
}

.wizard-label {
  @apply text-[12px] text-neutral-600;
}

.wizard-textarea {
  @apply min-h-52;
}

.wizard-prompt-tools {
  @apply flex flex-wrap gap-2;
}

.wizard-checkbox {
  @apply self-start;
}

.wizard-copy {
  @apply m-0 text-[12px] leading-5 text-neutral-500;
}

.wizard-error {
  @apply m-0 text-[12px] leading-5 text-red-600;
}

.wizard-actions {
  @apply mt-5 flex flex-wrap gap-2;
}

</style>
