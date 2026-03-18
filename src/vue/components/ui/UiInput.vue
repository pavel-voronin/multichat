<template>
  <input
    :value="displayValue"
    :type="type"
    class="ui-input"
    v-bind="$attrs"
    @input="handleInput"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    type?: string;
  }>(),
  {
    type: 'text',
  },
);

const [modelValue, modifiers] = defineModel<string | number | null>({
  default: '',
});

const displayValue = computed(() => modelValue.value ?? '');

function handleInput(event: Event) {
  let nextValue: string | number | null = (event.target as HTMLInputElement)
    .value;

  if (modifiers.trim && typeof nextValue === 'string') {
    nextValue = nextValue.trim();
  }

  if (modifiers.number) {
    modelValue.value = nextValue === '' ? null : Number(nextValue);
    return;
  }

  modelValue.value = nextValue;
}
</script>

<style scoped>
@reference "../../../styles.css";

.ui-input {
  @apply rounded-md border border-neutral-300 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400;
}
</style>
