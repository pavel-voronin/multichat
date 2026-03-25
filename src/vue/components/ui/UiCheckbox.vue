<template>
  <label class="ui-checkbox">
    <input
      :checked="Boolean(modelValue)"
      type="checkbox"
      class="ui-checkbox-input"
      v-bind="$attrs"
      @change="handleChange"
    />
    <span v-if="$slots.default" class="ui-checkbox-label">
      <slot />
    </span>
  </label>
</template>

<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
});

const modelValue = defineModel<boolean>({
  default: false,
});

function handleChange(event: Event) {
  modelValue.value = (event.target as HTMLInputElement).checked;
}
</script>

<style scoped>
@reference "@styles";

.ui-checkbox {
  @apply inline-flex w-fit items-center gap-3 align-middle;
}

.ui-checkbox-input {
  @apply m-0 h-4 w-4 shrink-0 appearance-none rounded-[3px] border border-neutral-400 bg-white align-middle outline-none transition checked:border-neutral-900 checked:bg-neutral-900 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4 8.2 6.7 11 12 5.5' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
  background-size: 0;
}

.ui-checkbox-input:checked {
  background-size: 0.8rem 0.8rem;
}

.ui-checkbox-label {
  @apply text-[13px] leading-5 text-neutral-600;
}
</style>
