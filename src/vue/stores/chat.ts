import { defineStore, storeToRefs } from 'pinia';
import { computed } from 'vue';
import type {
  AgentConfig,
  ChatMessage,
  MultiChatRuntime,
  OpenRouterModel,
  RequestTrace,
  RuntimeEvent,
} from '../../core';
import { formatMessageCost } from '../utils/costing';
import { buildVisibleTimelineEntries } from '../utils/timeline';
import { useMessageInputStore } from './messageInput';
import { usePreferencesStore } from './preferences';
import { useRuntimeStore } from './runtime';
import type {
  ChatViewPreferences,
  CostDisplayMode,
  RenderedParticipant,
  RenderedTab,
  VisibleTimelineEntry,
} from '../types';

export const useChatStore = defineStore('chat', () => {
  const runtimeStore = useRuntimeStore();
  const preferencesStore = usePreferencesStore();
  const messageInputStore = useMessageInputStore();
  const { state, workspace } = storeToRefs(runtimeStore);
  const runtime = computed<MultiChatRuntime>(() => runtimeStore.requireRuntime());

  const preferences = computed<ChatViewPreferences>(() => ({
    showContextCutoffs: preferencesStore.showContextCutoffs,
    showSilentDecisions: preferencesStore.showSilentDecisions,
    costDisplayMode: preferencesStore.costDisplayMode,
  }));

  const humanParticipant = computed(
    () =>
      state.value.participants.find((participant) => participant.role === 'human') ??
      null,
  );

  const renderedTabs = computed<RenderedTab[]>(() =>
    workspace.value.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      isActive: tab.id === workspace.value.activeTabId,
      header: {
        title: tab.title,
        badge: null,
      },
    })),
  );

  const visibleTimelineEntries = computed<VisibleTimelineEntry[]>(() =>
    buildVisibleTimelineEntries({
      runtime: runtime.value,
      state: state.value,
      participantId: humanParticipant.value?.id ?? 'human',
      preferences: preferences.value,
    }),
  );

  const visibleParticipants = computed(() =>
    state.value.participants.filter((participant) => {
      if (participant.role === 'human') {
        return true;
      }

      const agent = state.value.agents.find((item) => item.id === participant.id);
      return agent?.isHidden !== true;
    }),
  );

  const participantRows = computed<RenderedParticipant[]>(() =>
    visibleParticipants.value.map((participant) => ({
      id: participant.id,
      name: participant.name,
      role: participant.role,
      subtitle:
        participant.role === 'human'
          ? 'human'
          : state.value.agents.find((agent) => agent.id === participant.id)?.modelId ??
            participant.role,
      showMoney:
        preferencesStore.costDisplayMode !== 'off' &&
        participant.role === 'agent' &&
        state.value.agents.find((agent) => agent.id === participant.id)?.isHidden !==
          true,
      spentSummary: formatMessageCost(
        participant.role === 'agent'
          ? state.value.metrics[participant.id]?.estimatedCost ?? 0
          : 0,
      ),
    })),
  );

  function participantNameById(participantId: string): string | null {
    return (
      state.value.participants.find(
        (participant) => participant.id === participantId,
      )?.name ?? null
    );
  }

  function updateRuntimeSettings(
    patch: Parameters<MultiChatRuntime['updateSettings']>[0],
  ): void {
    runtime.value.updateSettings(patch);
  }

  function updateViewPreferences(
    patch: Partial<ChatViewPreferences>,
  ): void {
    if (typeof patch.showContextCutoffs === 'boolean') {
      preferencesStore.showContextCutoffs = patch.showContextCutoffs;
    }
    if (typeof patch.showSilentDecisions === 'boolean') {
      preferencesStore.showSilentDecisions = patch.showSilentDecisions;
    }
    if (patch.costDisplayMode) {
      preferencesStore.costDisplayMode = patch.costDisplayMode;
    }
  }

  function toggleContextCutoffs(): void {
    preferencesStore.showContextCutoffs = !preferencesStore.showContextCutoffs;
  }

  function toggleSilentDecisions(): void {
    preferencesStore.showSilentDecisions = !preferencesStore.showSilentDecisions;
  }

  function cycleCostDisplayMode(): void {
    const nextModeByCurrent: Record<CostDisplayMode, CostDisplayMode> = {
      off: 'request',
      request: 'net',
      net: 'off',
    };
    preferencesStore.costDisplayMode =
      nextModeByCurrent[preferencesStore.costDisplayMode];
  }

  function createTab(input?: Parameters<MultiChatRuntime['createTab']>[0]) {
    return runtime.value.createTab(input);
  }

  function activateTab(tabId: string): void {
    runtime.value.activateTab(tabId);
  }

  function renameTab(tabId: string, title: string): void {
    runtime.value.renameTab(tabId, title);
  }

  function moveTab(tabId: string, toIndex: number): void {
    runtime.value.moveTab(tabId, toIndex);
  }

  function closeTab(tabId: string): void {
    runtime.value.closeTab(tabId);
    messageInputStore.clearDraft(tabId);
  }

  function resetAgentHistoryContext(): void {
    runtime.value.resetAgentHistoryContext();
  }

  function clearHistoryBeforeAgentCutoff(): void {
    runtime.value.clearHistoryBeforeAgentCutoff();
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

  function createAgent(input: Omit<AgentConfig, 'id'> & { id?: string }) {
    return runtime.value.createAgent(input);
  }

  function updateAgent(
    agentId: string,
    patch: Partial<Omit<AgentConfig, 'id'>>,
  ) {
    return runtime.value.updateAgent(agentId, patch);
  }

  function removeAgent(agentId: string): void {
    runtime.value.removeAgent(agentId);
  }

  async function listModels(): Promise<OpenRouterModel[]> {
    return runtime.value.listModels();
  }

  function getRequestTrace(traceId: string): RequestTrace | null {
    return runtime.value.getRequestTrace(traceId);
  }

  function getRelatedRequestTraces(traceId: string): RequestTrace[] {
    return runtime.value.getRelatedRequestTraces(traceId);
  }

  function getMessageInspectionGraph(messageId: string) {
    return runtime.value.getMessageInspectionGraph(messageId);
  }

  function getInspectionSubjectForMessage(messageId: string) {
    return runtime.value.getInspectionSubjectForMessage(messageId);
  }

  function canInspectEvent(event: RuntimeEvent): boolean {
    return Boolean(event.sourceTraceId);
  }

  function canInspectMessage(message: ChatMessage): boolean {
    if (message.sourceTraceId) {
      return true;
    }

    return getInspectionSubjectForMessage(message.id).downstreamTraces.length > 0;
  }

  return {
    state,
    workspace,
    preferences,
    humanParticipant,
    renderedTabs,
    visibleTimelineEntries,
    participantRows,
    participantNameById,
    updateRuntimeSettings,
    updateViewPreferences,
    toggleContextCutoffs,
    toggleSilentDecisions,
    cycleCostDisplayMode,
    createTab,
    activateTab,
    renameTab,
    moveTab,
    closeTab,
    resetAgentHistoryContext,
    clearHistoryBeforeAgentCutoff,
    stop,
    resetRuntime,
    updateHumanParticipant,
    createAgent,
    updateAgent,
    removeAgent,
    listModels,
    getRequestTrace,
    getRelatedRequestTraces,
    getMessageInspectionGraph,
    getInspectionSubjectForMessage,
    canInspectEvent,
    canInspectMessage,
  };
});
