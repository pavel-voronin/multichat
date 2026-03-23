<template>
  <div class="model-card">
    <div class="model-card-info">
      <span class="model-card-name">{{ displayName }}</span>
      <span v-if="contextLabel" class="model-card-sep">·</span>
      <span v-if="contextLabel" class="model-card-meta">{{
        contextLabel
      }}</span>
      <span v-if="priceLabel" class="model-card-sep">·</span>
      <span v-if="priceLabel" class="model-card-meta">{{ priceLabel }}</span>
      <span v-if="isFree" class="model-card-badge-free">Free</span>
    </div>
    <UiButton v-if="!readonly" size="sm" @click="$emit('change')">Change</UiButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ModelSnapshot } from '../../core';
import { useModelsStore } from '../stores/models';
import UiButton from './ui/UiButton.vue';

const props = defineProps<{
  modelId: string;
  snapshot?: ModelSnapshot;
  readonly?: boolean;
}>();

defineEmits<{ change: [] }>();

const modelsStore = useModelsStore();

const liveModel = computed(() => modelsStore.findById(props.modelId));

const displayName = computed(() => {
  const model = liveModel.value;
  if (model) {
    const provider = model.id.includes('/') ? model.id.split('/')[0] : null;
    return provider ? `${provider} / ${model.name}` : model.name;
  }
  return props.modelId;
});

const contextLength = computed(
  () => liveModel.value?.context_length ?? props.snapshot?.contextLength,
);

const contextLabel = computed(() => {
  const len = contextLength.value;
  if (!len) return null;
  if (len >= 1_000_000) return `${Math.round(len / 1_000_000)}M ctx`;
  if (len >= 1_000) return `${Math.round(len / 1_000)}k ctx`;
  return `${len} ctx`;
});

const isFree = computed(() => props.modelId.endsWith(':free'));

const priceLabel = computed(() => {
  if (isFree.value) return null;
  const pricing = liveModel.value?.pricing;
  if (!pricing?.prompt && !pricing?.completion) return null;
  const formatPrice = (raw: string | undefined) => {
    if (!raw) return '?';
    const perMillion = parseFloat(raw) * 1_000_000;
    return `$${perMillion.toFixed(perMillion < 0.01 ? 4 : 2)}`;
  };
  return `${formatPrice(pricing.prompt)} / ${formatPrice(pricing.completion)} per 1M`;
});
</script>

<style scoped>
@reference "../../styles.css";

.model-card {
  @apply flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2;
}

.model-card-info {
  @apply flex flex-wrap items-center gap-1.5 overflow-hidden;
}

.model-card-name {
  @apply truncate font-mono text-[12px] font-semibold text-neutral-900;
}

.model-card-sep {
  @apply text-[12px] text-neutral-300;
}

.model-card-meta {
  @apply font-mono text-[11px] text-neutral-500;
}

.model-card-badge-free {
  @apply rounded-sm bg-green-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-green-800;
}
</style>
