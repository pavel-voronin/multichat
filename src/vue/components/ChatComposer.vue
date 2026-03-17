<template>
  <div class="composer-panel">
    <div class="composer-row">
      <UiTextarea
        ref="composer"
        v-model="draft"
        class="composer-input"
        rows="1"
        placeholder="Type a message"
        @keydown="handleKeydown"
      />

      <div class="composer-actions">
        <UiButton
          class="send-button"
          variant="primary"
          :disabled="!canSend"
          @click="$emit('send')"
        >
          Send
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import UiButton from './ui/UiButton.vue';
import UiTextarea from './ui/UiTextarea.vue';

const props = defineProps<{
  modelValue: string;
  canSend: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  send: [];
}>();

const composer = useTemplateRef<{ focus: () => void }>('composer');

const draft = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
});

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    emit('send');
  }
}

defineExpose({
  focus: () => composer.value?.focus(),
});
</script>

<style scoped>
@reference "../../styles.css";

.composer-panel {
  @apply border-t border-neutral-300 bg-neutral-50 px-3 py-2;
}

.composer-row {
  @apply flex items-end gap-2;
}

.composer-input {
  @apply field-sizing-content min-h-[30px] max-h-40 flex-1 resize-none overflow-auto px-3 py-1 text-[13px] leading-5;
}

.composer-actions {
  @apply flex shrink-0 gap-2 self-end;
}
</style>
