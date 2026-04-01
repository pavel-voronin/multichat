<template>
  <UiModal :open="ui.showAgentWizard" size="lg" @close="close">
    <template #title>
      <h2 class="wizard-title">
        {{ agent ? 'Edit agent' : 'Create agent' }}
      </h2>
    </template>

    <div v-if="!isApiKeyPresent" class="wizard-blocked">
      <p class="wizard-copy">
        OpenRouter key is required before creating agents.
      </p>
      <UiButton
        class="wizard-primary-button"
        variant="primary"
        @click="openSettings"
      >
        Open settings
      </UiButton>
    </div>

    <template v-else>
      <label class="wizard-field">
        <span class="wizard-label">Name</span>
        <UiInput v-model="name" class="wizard-input" type="text" />
      </label>

      <div class="wizard-field">
        <span class="wizard-label">Model</span>
        <ModelCard
          :model-id="modelId"
          :snapshot="agent?.modelSnapshot"
          @change="showBrowser = true"
        />
      </div>

      <ModelBrowserDialog
        v-if="showBrowser"
        @select="onModelSelect"
        @close="showBrowser = false"
      />

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
          instructions. Your text defines the agent's role and judgment. The app
          still injects the response contract, visibility rules, and tool/JSON
          command format automatically.
        </p>
        <UiTextarea v-model="systemPrompt" class="wizard-textarea" rows="10" />
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
        <UiButton
          v-if="agent"
          class="wizard-delete-button"
          variant="danger"
          @click="requestDeleteAgent"
        >
          Delete
        </UiButton>
      </div>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';
import ModelBrowserDialog from '../models/ModelBrowserDialog.vue';
import ModelCard from '../models/ModelCard.vue';
import { defaultPromptPreset, promptPresets } from '../../promptPresets';
import { useAgentsStore } from '../../stores/agents';
import { useModelsStore } from '../../stores/models';
import { useUiStore } from '../../stores/ui';
import UiButton from '../ui/UiButton.vue';
import UiInput from '../ui/UiInput.vue';
import UiModal from '../ui/UiModal.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const agentsStore = useAgentsStore();
const { selectedAgent: agent, isApiKeyPresent } = storeToRefs(agentsStore);
const ui = useUiStore();

const modelsStore = useModelsStore();
const showBrowser = ref(false);
const name = ref('');
const modelId = ref('');
const systemPrompt = ref('');
const selectedPresetId = ref(defaultPromptPreset.id);

function onModelSelect(selectedId: string) {
  modelId.value = selectedId;
  showBrowser.value = false;
}

watch(
  agent,
  (nextAgent) => {
    name.value = nextAgent?.name ?? '';
    modelId.value = nextAgent?.modelId ?? '';
    systemPrompt.value = nextAgent?.systemPrompt ?? defaultPromptPreset.prompt;
    selectedPresetId.value = defaultPromptPreset.id;
  },
  { immediate: true },
);

watch(
  () => ui.showAgentWizard,
  async (isOpen) => {
    if (isOpen && isApiKeyPresent.value) {
      await modelsStore.fetchModels();
    }
    if (isOpen && !agent.value) {
      name.value = '';
      modelId.value = '';
      systemPrompt.value = defaultPromptPreset.prompt;
      selectedPresetId.value = defaultPromptPreset.id;
      if (ui.preselectedModelId) {
        modelId.value = ui.preselectedModelId;
        ui.preselectedModelId = null;
      }
    }
  },
  { immediate: true },
);

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

function requestDeleteAgent() {
  if (!agent.value) {
    return;
  }

  ui.pendingDeleteAgentId = agent.value.id;
  ui.pendingDeleteAgentName = agent.value.name;
  ui.showAgentWizard = false;
  ui.showDeleteAgentConfirm = true;
}

function save() {
  const liveModel = modelsStore.findById(modelId.value);
  const modelSnapshot = liveModel
    ? {
        contextLength: liveModel.context_length,
        supportedParameters: liveModel.supported_parameters,
      }
    : agent.value?.modelSnapshot;

  const payload = {
    name: name.value.trim(),
    modelId: modelId.value,
    pricing: liveModel?.pricing ?? agent.value?.pricing,
    modelSnapshot,
    systemPrompt: systemPrompt.value.trim(),
  };

  if (agent.value?.id) {
    agentsStore.updateAgent(agent.value.id, payload);
  } else {
    agentsStore.createAgent(payload);
  }

  close();
}

function openSettings() {
  ui.reopenAgentWizardAfterSettings = ui.showAgentWizard;
  ui.showAgentWizard = false;
  ui.showSettings = true;
}
</script>

<style scoped>
@reference "@styles";

.wizard-title {
  @apply m-0 text-base font-semibold;
}

.wizard-delete-button {
  @apply text-red-700;
}

.wizard-blocked {
  @apply mt-4 grid gap-3 px-5 pb-5;
}

.wizard-field {
  @apply mt-4 grid gap-2 px-5;
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

.wizard-copy {
  @apply m-0 text-[12px] leading-5 text-neutral-500;
}

.wizard-actions {
  @apply mt-5 flex flex-wrap gap-2 px-5 pb-5;
}
</style>
