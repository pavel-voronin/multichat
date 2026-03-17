import { inject, provide, reactive } from 'vue';

export interface UiState {
  showSettings: boolean;
  showAgentWizard: boolean;
  showHumanNameModal: boolean;
  showDeleteAgentConfirm: boolean;
  showLogsPanel: boolean;
  editingAgentId: string | null;
  pendingDeleteAgentId: string | null;
  pendingDeleteAgentName: string;
  reopenAgentWizardAfterSettings: boolean;
}

const uiStateInjectionKey = Symbol('multi-chat-ui-state');

const defaultUiState = (): UiState => ({
  showSettings: false,
  showAgentWizard: false,
  showHumanNameModal: false,
  showDeleteAgentConfirm: false,
  showLogsPanel: false,
  editingAgentId: null,
  pendingDeleteAgentId: null,
  pendingDeleteAgentName: '',
  reopenAgentWizardAfterSettings: false,
});

export function provideUiState(): UiState {
  const state = reactive<UiState>(defaultUiState());
  provide(uiStateInjectionKey, state);
  return state;
}

export function useUiState(): UiState {
  const state = inject<UiState | null>(uiStateInjectionKey, null);
  if (!state) {
    throw new Error('UI state was not provided');
  }

  return state;
}
