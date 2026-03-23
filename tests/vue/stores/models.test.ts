import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { MultiChatRuntime } from '../../../src/core/runtime';
import type { OpenRouterTransport, WorkspaceState } from '../../../src/core';
import { useRuntimeStore } from '../../../src/vue/stores/runtime';
import { useModelsStore } from '../../../src/vue/stores/models';

function createTransport(): OpenRouterTransport {
  return {
    listModels: vi.fn().mockResolvedValue([
      {
        id: 'openai/gpt-4.1',
        name: 'GPT-4.1',
        context_length: 128000,
        supported_parameters: ['tools'],
      },
    ]),
    runAgentTurn: vi.fn().mockResolvedValue({
      mode: 'tools',
      action: { type: 'stay_silent', reason: 'noop' },
    }),
  };
}

function createRuntime(options?: {
  transport?: OpenRouterTransport;
  initialState?: Partial<WorkspaceState> | null;
}) {
  return new MultiChatRuntime({
    transport: options?.transport ?? createTransport(),
    initialState: options?.initialState,
    storage: {
      load: async () => null,
      save: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    },
  });
}

describe('useModelsStore', () => {
  it('hydrates models from the persisted snapshot before any network refresh', async () => {
    const transport = createTransport();
    const seededRuntime = createRuntime({ transport });
    seededRuntime.updateSettings({ openRouterApiKey: 'key' });
    seededRuntime.setModelsCatalogSnapshot({
      models: [
        {
          id: 'anthropic/claude-sonnet-4',
          name: 'Claude Sonnet 4',
          context_length: 200000,
          supported_parameters: ['tools'],
        },
      ],
      lastFetchedAt: Date.now(),
    });

    const runtime = createRuntime({
      transport,
      initialState: seededRuntime.getWorkspaceState(),
    });
    const pinia = createPinia();
    useRuntimeStore(pinia).initialize(runtime);

    const store = useModelsStore(pinia);

    expect(store.models).toEqual([
      expect.objectContaining({ id: 'anthropic/claude-sonnet-4' }),
    ]);

    await store.fetchModels();

    expect(transport.listModels).not.toHaveBeenCalled();
  });

  it('invalidates local and persisted models cache', async () => {
    const transport = createTransport();
    const runtime = createRuntime({ transport });
    runtime.updateSettings({ openRouterApiKey: 'key' });
    runtime.setModelsCatalogSnapshot({
      models: [
        {
          id: 'openai/gpt-4.1',
          name: 'GPT-4.1',
          context_length: 128000,
          supported_parameters: ['tools'],
        },
      ],
      lastFetchedAt: Date.now(),
    });

    const pinia = createPinia();
    useRuntimeStore(pinia).initialize(runtime);

    const store = useModelsStore(pinia);
    expect(store.models).toHaveLength(1);

    store.invalidateCache();

    expect(store.models).toEqual([]);
    expect(store.lastFetchedAt).toBeNull();
    expect(runtime.getModelsCatalogSnapshot()).toBeNull();
  });
});
