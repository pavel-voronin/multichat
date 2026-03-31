import { storeToRefs } from 'pinia';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { fingerprintApiKey, type OpenRouterModel } from '../../core';
import { useRuntimeStore } from './runtime';

const CACHE_TTL_MS = 5 * 60 * 1000;

function sortModels(items: OpenRouterModel[]): OpenRouterModel[] {
  return items.slice().sort((a, b) => {
    const aProvider = a.id.split('/')[0] ?? a.id;
    const bProvider = b.id.split('/')[0] ?? b.id;
    const diff = aProvider.localeCompare(bProvider);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

export const useModelsStore = defineStore('models', () => {
  const runtimeStore = useRuntimeStore();
  const { runtime, state } = storeToRefs(runtimeStore);

  const models = ref<OpenRouterModel[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastFetchedAt = ref<number | null>(null);

  function findById(id: string): OpenRouterModel | undefined {
    return models.value.find((m) => m.id === id);
  }

  function hydrateFromSnapshot(): void {
    const snapshot = runtimeStore.requireRuntime().getModelsCatalogSnapshot();
    const apiKey = runtimeStore.requireState().settings.openRouterApiKey;
    const expectedFingerprint = apiKey ? fingerprintApiKey(apiKey) : null;
    if (
      !snapshot ||
      snapshot.apiKeyFingerprint !== expectedFingerprint ||
      !snapshot.models.length
    ) {
      return;
    }

    models.value = sortModels(snapshot.models);
    lastFetchedAt.value = snapshot.lastFetchedAt;
  }

  async function fetchModels(options?: { force?: boolean }): Promise<void> {
    if (isLoading.value) {
      return;
    }
    const now = Date.now();
    if (
      !options?.force &&
      lastFetchedAt.value !== null &&
      now - lastFetchedAt.value < CACHE_TTL_MS
    ) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = await runtimeStore.requireRuntime().listModels();
      models.value = sortModels(result);
      lastFetchedAt.value = Date.now();
      runtimeStore.requireRuntime().setModelsCatalogSnapshot({
        models: result,
        lastFetchedAt: lastFetchedAt.value,
      });
      error.value = null;
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to load models';
    } finally {
      isLoading.value = false;
    }
  }

  function clearLocalCache(): void {
    models.value = [];
    isLoading.value = false;
    error.value = null;
    lastFetchedAt.value = null;
  }

  function invalidateCache(): void {
    runtime.value?.clearModelsCatalogSnapshot();
    clearLocalCache();
  }

  function reset(): void {
    clearLocalCache();
  }

  hydrateFromSnapshot();
  watch(
    () => state.value?.settings.openRouterApiKey ?? null,
    (nextApiKey, previousApiKey) => {
      if (nextApiKey === previousApiKey || runtime.value === null) {
        return;
      }

      clearLocalCache();
    },
  );

  return {
    models,
    isLoading,
    error,
    lastFetchedAt,
    findById,
    fetchModels,
    invalidateCache,
    reset,
  };
});
