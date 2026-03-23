import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PersistenceAdapter, WorkspaceState } from './types';
import { deepClone } from './utils';

const STORAGE_VERSION = 10;
const DATABASE_VERSION = 1;
const DATABASE_NAME = 'multichat';
const STORE_NAME = 'runtime' as const;
const SNAPSHOT_KEY = 'workspace' as const;

interface StoredPayload {
  version: number;
  state: WorkspaceState;
}

interface PersistenceDbSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: StoredPayload;
  };
}

export class NoopPersistenceAdapter implements PersistenceAdapter {
  async load(): Promise<Partial<WorkspaceState> | null> {
    return null;
  }

  async save(_state: WorkspaceState): Promise<void> {}

  async reset(): Promise<void> {}
}

export class IndexedDbPersistenceAdapter implements PersistenceAdapter {
  private databasePromise: Promise<IDBPDatabase<PersistenceDbSchema>> | null =
    null;

  constructor(private readonly databaseName = DATABASE_NAME) {}

  async load(): Promise<Partial<WorkspaceState> | null> {
    const database = await this.openDatabase();
    if (!database) {
      return null;
    }

    const payload = await database.get(STORE_NAME, SNAPSHOT_KEY);
    if (!payload || payload.version !== STORAGE_VERSION || !payload.state) {
      return null;
    }

    try {
      return deepClone(payload.state);
    } catch {
      await database.delete(STORE_NAME, SNAPSHOT_KEY);
      return null;
    }
  }

  async save(state: WorkspaceState): Promise<void> {
    const database = await this.openDatabase();
    if (!database) {
      return;
    }

    const payload: StoredPayload = {
      version: STORAGE_VERSION,
      state,
    };

    await database.put(STORE_NAME, payload, SNAPSHOT_KEY);
  }

  async reset(): Promise<void> {
    const database = await this.openDatabase();
    if (!database) {
      return;
    }

    await database.delete(STORE_NAME, SNAPSHOT_KEY);
  }

  private async openDatabase(): Promise<IDBPDatabase<PersistenceDbSchema> | null> {
    if (typeof indexedDB === 'undefined') {
      return null;
    }

    this.databasePromise ??= openDB<PersistenceDbSchema>(
      this.databaseName,
      DATABASE_VERSION,
      {
        upgrade: (database) => {
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME);
          }
        },
      },
    );

    return this.databasePromise;
  }
}
