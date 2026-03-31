import { defineStore } from 'pinia';
import { computed } from 'vue';
import type { MultiChatRuntime } from '../../core';
import { useMessageInputStore } from './messageInput';
import { useModelsStore } from './models';
import { usePreferencesStore } from './preferences';
import { useRuntimeStore } from './runtime';
import { useUiStore } from './ui';
import { useInspectionStore } from './inspection';
import type { WelcomeChatPreset } from '../components/welcome/presets';

export const useSessionStore = defineStore('session', () => {
  const runtimeStore = useRuntimeStore();
  const preferencesStore = usePreferencesStore();
  const messageInputStore = useMessageInputStore();
  const modelsStore = useModelsStore();
  const inspectionStore = useInspectionStore();
  const uiStore = useUiStore();
  const runtime = computed<MultiChatRuntime>(() =>
    runtimeStore.requireRuntime(),
  );

  function updateRuntimeSettings(
    patch: Parameters<MultiChatRuntime['updateSettings']>[0],
  ): void {
    runtime.value.updateSettings(patch);
  }

  async function validateOpenRouterApiKey(apiKey: string): Promise<void> {
    await runtime.value.validateOpenRouterApiKey(apiKey);
  }

  function updateTurnOrdering(
    patch: Parameters<MultiChatRuntime['updateTurnOrdering']>[0],
  ): void {
    runtime.value.updateTurnOrdering(patch);
  }

  function updateMaxAutoRounds(
    value: Parameters<MultiChatRuntime['updateMaxAutoRounds']>[0],
  ): void {
    runtime.value.updateMaxAutoRounds(value);
  }

  function toggleSilentDecisions(): void {
    preferencesStore.showSilentDecisions =
      !preferencesStore.showSilentDecisions;
  }

  function cycleCostDisplayMode(): void {
    const nextModeByCurrent = {
      off: 'request',
      request: 'net',
      net: 'off',
    } as const;
    preferencesStore.costDisplayMode =
      nextModeByCurrent[preferencesStore.costDisplayMode];
  }

  function resetAgentHistoryContext(): void {
    runtime.value.resetAgentHistoryContext();
  }

  function clearHistoryBeforeAgentCutoff(): void {
    runtime.value.clearHistoryBeforeAgentCutoff();
  }

  function clearDebugLogs(): void {
    runtime.value.clearDebugLogs();
  }

  function moveManualCutoffBefore(targetEntryId: string | null): void {
    runtime.value.moveManualCutoffBefore(targetEntryId);
  }

  function removeManualCutoff(): void {
    runtime.value.removeManualCutoff();
  }

  function stop(): void {
    runtime.value.stop();
  }

  function resetRuntime(): void {
    runtime.value.reset();
    preferencesStore.reset();
    messageInputStore.reset();
    modelsStore.reset();
    inspectionStore.reset();
    uiStore.enterFreshState();
  }

  function updateHumanParticipant(
    patch: Parameters<MultiChatRuntime['updateHumanParticipant']>[0],
  ): void {
    runtime.value.updateHumanParticipant(patch);
  }

  function launchPreset(preset: WelcomeChatPreset, modelId: string): void {
    const tabId = runtime.value.getWorkspaceState().activeTabId;
    runtime.value.renameTab(tabId, preset.title);
    for (const agent of preset.agents) {
      runtime.value.createAgent({ ...agent, modelId }, tabId);
    }
    messageInputStore.setDraftForTab(tabId, preset.initialMessage);
    uiStore.showWelcomeModal = false;
  }

  return {
    validateOpenRouterApiKey,
    updateRuntimeSettings,
    updateTurnOrdering,
    updateMaxAutoRounds,
    toggleSilentDecisions,
    cycleCostDisplayMode,
    resetAgentHistoryContext,
    clearDebugLogs,
    clearHistoryBeforeAgentCutoff,
    moveManualCutoffBefore,
    removeManualCutoff,
    stop,
    resetRuntime,
    updateHumanParticipant,
    launchPreset,
  };
});
