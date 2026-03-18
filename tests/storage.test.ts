import { describe, expect, it, vi } from 'vitest';
import { LocalStoragePersistenceAdapter } from '../src/core/storage';
import type { RuntimeState } from '../src/core';

function createState(): RuntimeState {
  return {
    participants: [{ id: 'human', name: 'You', role: 'human' }],
    agents: [],
    timeline: [],
    metrics: {},
    settings: {
      openRouterApiKey: 'abc',
      defaultContextWindowSize: 40,
      showContextCutoffs: false,
      showSilentDecisions: false,
      costDisplayMode: 'request',
    },
    debugLogs: [],
    errors: [],
    execution: {
      isSweepRunning: false,
      queuedSweep: false,
      sweepCount: 0,
      stopRequested: false,
    },
    requestTraces: {},
    messageInspectionIndex: {},
  };
}

describe('LocalStoragePersistenceAdapter', () => {
  it('saves and restores runtime state', () => {
    const store = new Map<string, string>();
    const adapter = new LocalStoragePersistenceAdapter('test-key', {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: (key) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    });

    const state = createState();
    adapter.save(state);

    expect(adapter.load()).toEqual(state);
  });

  it('returns null and clears corrupted payload', () => {
    const removeItem = vi.fn();
    const adapter = new LocalStoragePersistenceAdapter('test-key', {
      getItem: () => '{broken-json',
      setItem: vi.fn(),
      removeItem,
      clear: vi.fn(),
      key: vi.fn(),
      length: 1,
    });

    expect(adapter.load()).toBeNull();
    expect(removeItem).toHaveBeenCalledWith('test-key');
  });
});
