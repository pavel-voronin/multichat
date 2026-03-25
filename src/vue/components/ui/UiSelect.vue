<template>
  <div class="ui-select">
    <select
      :value="modelValue ?? ''"
      class="ui-select-input"
      v-bind="$attrs"
      @change="handleChange"
    >
      <slot />
    </select>
    <IconMdiChevronDown aria-hidden="true" class="ui-select-icon" />
  </div>
</template>

<script setup lang="ts">
import IconMdiChevronDown from '~icons/mdi/chevron-down';

defineOptions({
  inheritAttrs: false,
});

const modelValue = defineModel<string | number | null>({
  default: '',
});

function handleChange(event: Event) {
  modelValue.value = (event.target as HTMLSelectElement).value;
}
</script>

<style scoped>
@reference "@styles";

.ui-select {
  @apply relative inline-flex items-center;
}

.ui-select-input {
  @apply h-8 w-full appearance-none rounded-md border border-neutral-300 bg-white pl-3 pr-8 text-[12px] leading-none text-neutral-900 outline-none;
}

.ui-select-icon {
  @apply pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500;
}
</style>
