<template>
  <select :value="modelValue ?? ''" class="ui-input" v-bind="$attrs" @change="handleChange">
    <slot />
  </select>
</template>

<script setup lang="ts">
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
@reference "../../../styles.css";

.ui-input {
  @apply rounded-md border border-neutral-300 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none focus:border-neutral-400;
}
</style>
