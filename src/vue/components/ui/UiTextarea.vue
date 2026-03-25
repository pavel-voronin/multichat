<template>
  <textarea
    ref="element"
    :value="modelValue ?? ''"
    class="ui-textarea"
    v-bind="$attrs"
    @input="handleInput"
  />
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue';

defineOptions({
  inheritAttrs: false,
});

const modelValue = defineModel<string>({
  default: '',
});

const element = useTemplateRef<HTMLTextAreaElement>('element');

function handleInput(event: Event) {
  modelValue.value = (event.target as HTMLTextAreaElement).value;
}

function focus() {
  element.value?.focus();
}

defineExpose({
  element,
  focus,
});
</script>

<style scoped>
@reference "@styles";

.ui-textarea {
  @apply rounded-md border border-neutral-300 bg-white px-3 py-2 text-[13px] leading-5 text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400;
}
</style>
