import type { PersistenceAdapter, RuntimeState } from './types';
import { deepClone } from './utils';

const STORAGE_VERSION = 6;
const STORAGE_KEY = 'multichat.runtime';

interface StoredPayload {
  version: number;
  state: RuntimeState;
}

export class LocalStoragePersistenceAdapter implements PersistenceAdapter {
  constructor(
    private readonly storageKey = STORAGE_KEY,
    private readonly storage: Storage | undefined = typeof localStorage ===
    'undefined'
      ? undefined
      : localStorage,
  ) {}

  load(): Partial<RuntimeState> | null {
    if (!this.storage) {
      return null;
    }

    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }

    try {
      const payload = JSON.parse(raw) as Partial<StoredPayload>;
      if (payload.version !== STORAGE_VERSION || !payload.state) {
        return null;
      }

      return deepClone(payload.state);
    } catch {
      this.storage.removeItem(this.storageKey);
      return null;
    }
  }

  save(state: RuntimeState): void {
    if (!this.storage) {
      return;
    }

    const payload: StoredPayload = {
      version: STORAGE_VERSION,
      state: deepClone(state),
    };

    this.storage.setItem(this.storageKey, JSON.stringify(payload));
  }

  reset(): void {
    this.storage?.removeItem(this.storageKey);
  }
}
