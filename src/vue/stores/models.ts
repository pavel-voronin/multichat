import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { OpenRouterModel } from '../../core';
import { useRuntimeStore } from './runtime';

const CACHE_TTL_MS = 5 * 60 * 1000;

export const useModelsStore = defineStore('models', () => {
  const runtimeStore = useRuntimeStore();

  const models = ref<OpenRouterModel[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastFetchedAt = ref<number | null>(null);

  function findById(id: string): OpenRouterModel | undefined {
    return models.value.find((m) => m.id === id);
  }

  async function fetchModels(): Promise<void> {
    const now = Date.now();
    if (
      lastFetchedAt.value !== null &&
      now - lastFetchedAt.value < CACHE_TTL_MS
    ) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = await runtimeStore.requireRuntime().listModels();
      models.value = result.slice().sort((a, b) => {
        const aProvider = a.id.split('/')[0] ?? a.id;
        const bProvider = b.id.split('/')[0] ?? b.id;
        const diff = aProvider.localeCompare(bProvider);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
      lastFetchedAt.value = Date.now();
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to load models';
    } finally {
      isLoading.value = false;
    }
  }

  return { models, isLoading, error, lastFetchedAt, findById, fetchModels };
});
