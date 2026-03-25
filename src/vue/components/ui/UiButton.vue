<template>
  <button :type="type" :class="buttonClass" v-bind="$attrs">
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset';
    variant?: 'primary' | 'secondary' | 'danger';
    size?: 'sm' | 'md';
  }>(),
  {
    type: 'button',
    variant: 'secondary',
    size: 'md',
  },
);

const buttonClass = computed(() => [
  'ui-button',
  props.variant === 'primary' && 'ui-button-primary',
  props.variant === 'secondary' && 'ui-button-secondary',
  props.variant === 'danger' && 'ui-button-danger',
  props.size === 'sm' ? 'ui-button-sm' : 'ui-button-md',
]);
</script>

<style scoped>
@reference "@styles";

.ui-button {
  @apply rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50;
}

.ui-button-sm {
  @apply h-6 px-2 text-[11px] leading-none;
}

.ui-button-md {
  @apply h-8 px-3 text-[12px] leading-none;
}

.ui-button-primary {
  @apply border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500;
}

.ui-button-secondary {
  @apply border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50;
}

.ui-button-danger {
  @apply border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50;
}
</style>
