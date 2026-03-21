import { defineStore, storeToRefs } from 'pinia';
import { computed } from 'vue';
import type {
  AgentConfig,
  MultiChatRuntime,
  OpenRouterModel,
} from '../../core';
import { useRuntimeStore } from './runtime';
import { useUiStore } from './ui';

export const useAgentsStore = defineStore('agents', () => {
  const runtimeStore = useRuntimeStore();
  const ui = useUiStore();
  const { state } = storeToRefs(runtimeStore);
  const runtime = computed<MultiChatRuntime>(() =>
    runtimeStore.requireRuntime(),
  );

  const selectedAgent = computed<AgentConfig | null>(
    () =>
      state.value.agents.find((item) => item.id === ui.editingAgentId) ?? null,
  );

  const isApiKeyPresent = computed(() =>
    Boolean(state.value.settings.openRouterApiKey),
  );

  async function listModels(): Promise<OpenRouterModel[]> {
    return runtime.value.listModels();
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

  return {
    state,
    selectedAgent,
    isApiKeyPresent,
    listModels,
    createAgent,
    updateAgent,
    removeAgent,
  };
});
