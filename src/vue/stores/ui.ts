import { defineStore } from 'pinia';
import { ref } from 'vue';

export type InspectionTab = 'agent' | 'request' | 'result';

export interface UiStateSnapshot {
  showSettings: boolean;
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
    showSettings: false,
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
    activeInspectionTab: 'agent',
  };
}

export const useUiStore = defineStore('ui', () => {
  const showSettings = ref(false);
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
  const activeInspectionTab = ref<InspectionTab>('agent');

  function reset(): void {
    const defaults = defaultUiState();
    showSettings.value = defaults.showSettings;
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

  function resetChatScopedState(): void {
    const defaults = defaultUiState();
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
    showSettings,
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
    resetChatScopedState,
    loadPersistedState,
  };
});
