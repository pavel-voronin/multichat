import { defineStore } from 'pinia';
import { ref } from 'vue';

export type InspectionTab = 'participant' | 'input' | 'output' | 'used-in';

export interface UiStateSnapshot {
  showWelcomeModal: boolean;
  showSettings: boolean;
  showChatSettings: boolean;
  showAgentWizard: boolean;
  showHumanNameModal: boolean;
  showDeleteAgentConfirm: boolean;
  showLogsPanel: boolean;
  editingAgentId: string | null;
  preselectedModelId: string | null;
  pendingDeleteAgentId: string | null;
  pendingDeleteAgentName: string;
  reopenAgentWizardAfterSettings: boolean;
  showRequestInspection: boolean;
  activeInspectionTab: InspectionTab;
}

export interface ChatScopedUiStateSnapshot {
  showChatSettings: boolean;
  showAgentWizard: boolean;
  showHumanNameModal: boolean;
  showDeleteAgentConfirm: boolean;
  editingAgentId: string | null;
  preselectedModelId: string | null;
  pendingDeleteAgentId: string | null;
  pendingDeleteAgentName: string;
  reopenAgentWizardAfterSettings: boolean;
  showRequestInspection: boolean;
  activeInspectionTab: InspectionTab;
}

function defaultUiState(): UiStateSnapshot {
  return {
    showWelcomeModal: false,
    showSettings: false,
    showChatSettings: false,
    showAgentWizard: false,
    showHumanNameModal: false,
    showDeleteAgentConfirm: false,
    showLogsPanel: false,
    editingAgentId: null,
    preselectedModelId: null,
    pendingDeleteAgentId: null,
    pendingDeleteAgentName: '',
    reopenAgentWizardAfterSettings: false,
    showRequestInspection: false,
    activeInspectionTab: 'participant',
  };
}

export const useUiStore = defineStore('ui', () => {
  const showWelcomeModal = ref(false);
  const showSettings = ref(false);
  const showChatSettings = ref(false);
  const showAgentWizard = ref(false);
  const showHumanNameModal = ref(false);
  const showDeleteAgentConfirm = ref(false);
  const showLogsPanel = ref(false);
  const editingAgentId = ref<string | null>(null);
  const preselectedModelId = ref<string | null>(null);
  const pendingDeleteAgentId = ref<string | null>(null);
  const pendingDeleteAgentName = ref('');
  const reopenAgentWizardAfterSettings = ref(false);
  const showRequestInspection = ref(false);
  const activeInspectionTab = ref<InspectionTab>('participant');

  function reset(): void {
    const defaults = defaultUiState();
    showWelcomeModal.value = defaults.showWelcomeModal;
    showSettings.value = defaults.showSettings;
    showChatSettings.value = defaults.showChatSettings;
    showAgentWizard.value = defaults.showAgentWizard;
    showHumanNameModal.value = defaults.showHumanNameModal;
    showDeleteAgentConfirm.value = defaults.showDeleteAgentConfirm;
    showLogsPanel.value = defaults.showLogsPanel;
    editingAgentId.value = defaults.editingAgentId;
    preselectedModelId.value = defaults.preselectedModelId;
    pendingDeleteAgentId.value = defaults.pendingDeleteAgentId;
    pendingDeleteAgentName.value = defaults.pendingDeleteAgentName;
    reopenAgentWizardAfterSettings.value =
      defaults.reopenAgentWizardAfterSettings;
    showRequestInspection.value = defaults.showRequestInspection;
    activeInspectionTab.value = defaults.activeInspectionTab;
  }

  function enterFreshState(): void {
    reset();
    showWelcomeModal.value = true;
  }

  function resetChatScopedState(): void {
    const defaults = defaultUiState();
    showChatSettings.value = defaults.showChatSettings;
    showAgentWizard.value = defaults.showAgentWizard;
    showHumanNameModal.value = defaults.showHumanNameModal;
    showDeleteAgentConfirm.value = defaults.showDeleteAgentConfirm;
    editingAgentId.value = defaults.editingAgentId;
    preselectedModelId.value = defaults.preselectedModelId;
    pendingDeleteAgentId.value = defaults.pendingDeleteAgentId;
    pendingDeleteAgentName.value = defaults.pendingDeleteAgentName;
    reopenAgentWizardAfterSettings.value =
      defaults.reopenAgentWizardAfterSettings;
    showRequestInspection.value = defaults.showRequestInspection;
    activeInspectionTab.value = defaults.activeInspectionTab;
  }

  function loadPersistedState(data: { showLogsPanel: boolean }): void {
    showLogsPanel.value = data.showLogsPanel;
  }

  return {
    showWelcomeModal,
    showSettings,
    showChatSettings,
    showAgentWizard,
    showHumanNameModal,
    showDeleteAgentConfirm,
    showLogsPanel,
    editingAgentId,
    preselectedModelId,
    pendingDeleteAgentId,
    pendingDeleteAgentName,
    reopenAgentWizardAfterSettings,
    showRequestInspection,
    activeInspectionTab,
    reset,
    enterFreshState,
    resetChatScopedState,
    loadPersistedState,
  };
});
