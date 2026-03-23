import { describe, expect, it, vi } from 'vitest';
import { MultiChatRuntime } from '../../../src/core/runtime';
import { createTransport } from './helpers';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

describe('MultiChatRuntime persistence coordination', () => {
  it('coalesces rapid persistence requests into the latest snapshot', async () => {
    let releaseFirstSave!: () => void;
    const snapshots: Array<{ activeTabId: string; tabCount: number }> = [];
    const save = vi.fn().mockImplementation(async (state) => {
      snapshots.push({
        activeTabId: state.activeTabId,
        tabCount: state.tabs.length,
      });
      if (snapshots.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstSave = resolve;
        });
      }
    });

    const runtime = new MultiChatRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        action: { type: 'stay_silent', reason: 'noop' },
      })),
      storage: {
        load: async () => null,
        save,
        reset: vi.fn().mockResolvedValue(undefined),
      },
      now: () => new Date('2026-03-16T10:00:00.000Z'),
      idGenerator: (() => {
        let counter = 0;
        return () => `id-${++counter}`;
      })(),
    });

    runtime.createTab({ title: '#second' });
    runtime.createTab({ title: '#third', activate: false });

    expect(save).toHaveBeenCalledTimes(1);

    releaseFirstSave();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(save).toHaveBeenCalledTimes(2);
    expect(snapshots).toEqual([
      { activeTabId: 'tab-default', tabCount: 1 },
      { activeTabId: 'id-1', tabCount: 3 },
    ]);
  });

  it('resets storage before saving the new workspace snapshot', async () => {
    const operations: string[] = [];
    const runtime = new MultiChatRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        action: { type: 'stay_silent', reason: 'noop' },
      })),
      storage: {
        load: async () => null,
        save: vi.fn().mockImplementation(async (state) => {
          operations.push(
            `save:${state.tabs.length}:${state.debugLogs.length}`,
          );
        }),
        reset: vi.fn().mockImplementation(async () => {
          operations.push('reset');
        }),
      },
      now: () => new Date('2026-03-16T10:00:00.000Z'),
      idGenerator: (() => {
        let counter = 0;
        return () => `id-${++counter}`;
      })(),
    });

    await flushMicrotasks();
    operations.length = 0;

    runtime.reset();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(operations).toEqual(['reset', 'save:1:1']);
  });

  it('clears the persisted models snapshot when the API key changes', async () => {
    const runtime = new MultiChatRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        action: { type: 'stay_silent', reason: 'noop' },
      })),
      storage: {
        load: async () => null,
        save: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      },
    });

    runtime.updateSettings({ openRouterApiKey: 'key-1' });
    runtime.setModelsCatalogSnapshot({
      models: [
        {
          id: 'openai/gpt-4.1',
          name: 'GPT-4.1',
          context_length: 128000,
          supported_parameters: ['tools'],
        },
      ],
      lastFetchedAt: 123,
    });

    runtime.updateSettings({ openRouterApiKey: 'key-2' });

    expect(runtime.getModelsCatalogSnapshot()).toBeNull();
  });
});
