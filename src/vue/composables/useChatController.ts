import { computed, ref, watch, type Ref } from 'vue';
import type {
  AgentConfig,
  CostDisplayMode,
  MultiChatRuntime,
  RuntimeState,
} from '../../core';

type SaveAgentPayload = {
  id?: string;
  name: string;
  modelId: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  systemPrompt: string;
  contextWindowSize: number | null;
};

export function useChatController(input: {
  runtime: MultiChatRuntime;
  state: Readonly<Ref<RuntimeState>>;
  clearDraft: () => void;
}) {
  const showSettings = ref(false);
  const showAgentWizard = ref(false);
  const showHumanNameModal = ref(false);
  const reopenAgentWizardAfterSettings = ref(false);
  const editingAgentId = ref<string | null>(null);
  const showDeleteAgentConfirm = ref(false);
  const pendingDeleteAgentId = ref<string | null>(null);
  const pendingDeleteAgentName = ref('');
  const showLogsPanel = ref(false);

  watch(showSettings, (isOpen, wasOpen) => {
    if (isOpen || !wasOpen || !reopenAgentWizardAfterSettings.value) {
      return;
    }

    reopenAgentWizardAfterSettings.value = false;
    showAgentWizard.value = true;
  });

  const deleteAgentModalCopy = computed(() =>
    pendingDeleteAgentName.value
      ? `Agent "${pendingDeleteAgentName.value}" will disappear from the sidebar and stop participating in sweeps, but its name will remain in chat history.`
      : 'This agent will disappear from the sidebar and stop participating in sweeps, but its name will remain in chat history.',
  );

  const editingAgent = computed<AgentConfig | null>(
    () =>
      input.state.value.agents.find((agent) => agent.id === editingAgentId.value) ??
      null,
  );

  function openCreateAgentWizard() {
    editingAgentId.value = null;
    showAgentWizard.value = true;
  }

  function handleParticipantEditById(participantId: string) {
    const participant = input.state.value.participants.find(
      (item) => item.id === participantId,
    );
    if (!participant) {
      return;
    }

    if (participant.role === 'agent') {
      editingAgentId.value = participant.id;
      showAgentWizard.value = true;
      return;
    }

    showHumanNameModal.value = true;
  }

  function openDeleteAgentModalById(participantId: string) {
    const participant = input.state.value.participants.find(
      (item) => item.id === participantId,
    );
    if (!participant || participant.role !== 'agent') {
      return;
    }

    pendingDeleteAgentId.value = participant.id;
    pendingDeleteAgentName.value = participant.name;
    showDeleteAgentConfirm.value = true;
  }

  function closeDeleteAgentModal() {
    showDeleteAgentConfirm.value = false;
    pendingDeleteAgentId.value = null;
    pendingDeleteAgentName.value = '';
  }

  function confirmDeleteAgent() {
    if (!pendingDeleteAgentId.value) {
      closeDeleteAgentModal();
      return;
    }

    input.runtime.removeAgent(pendingDeleteAgentId.value);
    closeDeleteAgentModal();
  }

  function openSettingsFromAgentWizard() {
    reopenAgentWizardAfterSettings.value = showAgentWizard.value;
    showAgentWizard.value = false;
    showSettings.value = true;
  }

  function toggleContextCutoffs() {
    input.runtime.updateSettings({
      showContextCutoffs: !input.state.value.settings.showContextCutoffs,
    });
  }

  function toggleCostDisplayMode() {
    const nextModeByCurrent: Record<CostDisplayMode, CostDisplayMode> = {
      off: 'request',
      request: 'net',
      net: 'off',
    };
    const nextMode = nextModeByCurrent[input.state.value.settings.costDisplayMode];
    input.runtime.updateSettings({
      costDisplayMode: nextMode,
    });
  }

  function toggleSilentDecisions() {
    input.runtime.updateSettings({
      showSilentDecisions: !input.state.value.settings.showSilentDecisions,
    });
  }

  function toggleLogsPanel() {
    showLogsPanel.value = !showLogsPanel.value;
  }

  function clearHistoryBeforeCutoff() {
    input.runtime.clearHistoryBeforeAgentCutoff();
  }

  async function saveAgent(payload: SaveAgentPayload) {
    if (payload.id) {
      input.runtime.updateAgent(payload.id, {
        name: payload.name,
        modelId: payload.modelId,
        pricing: payload.pricing,
        systemPrompt: payload.systemPrompt,
        contextWindowSize: payload.contextWindowSize,
      });
      return;
    }

    input.runtime.createAgent({
      name: payload.name,
      modelId: payload.modelId,
      pricing: payload.pricing,
      systemPrompt: payload.systemPrompt,
      contextWindowSize: payload.contextWindowSize,
      capabilities: {
        prefersTools: true,
        supportsToolUse: 'unknown',
      },
    });
  }

  function resetApp() {
    input.runtime.reset();
    input.clearDraft();
    reopenAgentWizardAfterSettings.value = false;
    showSettings.value = false;
  }

  return {
    showSettings,
    showAgentWizard,
    showHumanNameModal,
    showDeleteAgentConfirm,
    showLogsPanel,
    editingAgent,
    deleteAgentModalCopy,
    openCreateAgentWizard,
    handleParticipantEditById,
    openDeleteAgentModalById,
    closeDeleteAgentModal,
    confirmDeleteAgent,
    openSettingsFromAgentWizard,
    toggleContextCutoffs,
    toggleCostDisplayMode,
    toggleSilentDecisions,
    toggleLogsPanel,
    clearHistoryBeforeCutoff,
    saveAgent,
    resetApp,
  };
}
