import { defineStore } from 'pinia';
import { computed } from 'vue';
import type { MultiChatRuntime } from '../../core';
import { useMessageInputStore } from './messageInput';
import { usePreferencesStore } from './preferences';
import { useRuntimeStore } from './runtime';

export const useSessionStore = defineStore('session', () => {
  const runtimeStore = useRuntimeStore();
  const preferencesStore = usePreferencesStore();
  const messageInputStore = useMessageInputStore();
  const runtime = computed<MultiChatRuntime>(() =>
    runtimeStore.requireRuntime(),
  );

  function updateRuntimeSettings(
    patch: Parameters<MultiChatRuntime['updateSettings']>[0],
  ): void {
    runtime.value.updateSettings(patch);
  }

  function updateContextWindowSize(contextWindowSize: number): void {
    runtime.value.updateTabContextWindowSize(contextWindowSize);
  }

  function toggleContextCutoffs(): void {
    preferencesStore.showContextCutoffs = !preferencesStore.showContextCutoffs;
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
    messageInputStore.reset();
  }

  function updateHumanParticipant(
    patch: Parameters<MultiChatRuntime['updateHumanParticipant']>[0],
  ): void {
    runtime.value.updateHumanParticipant(patch);
  }

  return {
    updateRuntimeSettings,
    updateContextWindowSize,
    toggleContextCutoffs,
    toggleSilentDecisions,
    cycleCostDisplayMode,
    resetAgentHistoryContext,
    clearHistoryBeforeAgentCutoff,
    moveManualCutoffBefore,
    removeManualCutoff,
    stop,
    resetRuntime,
    updateHumanParticipant,
  };
});
