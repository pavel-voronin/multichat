import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { IndexedDbPersistenceAdapter } from '../../src/core/storage';
import type { WorkspaceState } from '../../src/core';

function createState(): WorkspaceState {
  return {
    settings: {
      openRouterApiKey: 'abc',
    },
    debugLogs: [],
    errors: [],
    activeTabId: 'tab-1',
    tabs: [
      {
        id: 'tab-1',
        title: '#default',
        participants: [{ id: 'human', name: 'You', role: 'human' }],
        agents: [],
        timeline: [],
        metrics: {},
        execution: {
          isSweepRunning: false,
          queuedSweep: false,
          sweepCount: 0,
          stopRequested: false,
        },
        requestTraces: {},
        messageInspectionIndex: {},
      },
    ],
  };
}

function createAdapter(): IndexedDbPersistenceAdapter {
  return new IndexedDbPersistenceAdapter(
    `multichat-test-${Math.random().toString(36).slice(2)}`,
  );
}

describe('IndexedDbPersistenceAdapter', () => {
  it('saves and restores runtime state', async () => {
    const adapter = createAdapter();
    const state = createState();
    await adapter.save(state);

    await expect(adapter.load()).resolves.toEqual(state);
  });

  it('returns null when database is empty', async () => {
    const adapter = createAdapter();

    await expect(adapter.load()).resolves.toBeNull();
  });

  it('clears persisted state on reset', async () => {
    const adapter = createAdapter();
    await adapter.save(createState());

    await adapter.reset();

    await expect(adapter.load()).resolves.toBeNull();
  });

  it('returns null on payload version mismatch', async () => {
    const databaseName = `multichat-test-${Math.random().toString(36).slice(2)}`;
    const database = await openDB(databaseName, 1, {
      upgrade(db) {
        db.createObjectStore('runtime');
      },
    });
    await database.put(
      'runtime',
      {
        version: 999,
        state: createState(),
      },
      'workspace',
    );
    database.close();

    const adapter = new IndexedDbPersistenceAdapter(databaseName);

    await expect(adapter.load()).resolves.toBeNull();
  });
});
