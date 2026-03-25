<template>
  <div class="composer-panel">
    <div class="composer-row">
      <UiTextarea
        ref="messageInput"
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
          <span class="send-button-content">
            <span class="send-button-label">Send</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              title="Enter"
            >
              <path
                d="M13 3.5v5a1 1 0 0 1-1 1H5.2l2.1 2.1-.7.7-3.3-3.3 3.3-3.3.7.7-2.1 2.1H12V3.5h1Z"
                fill="currentColor"
              />
            </svg>
          </span>
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const props = defineProps<{
  modelValue: string;
  canSend: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  send: [];
}>();

const messageInput = useTemplateRef<{ focus: () => void }>('messageInput');

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
  focus: () => messageInput.value?.focus(),
});
</script>

<style scoped>
@reference "../../../styles.css";

.composer-panel {
  @apply border-t border-neutral-300 bg-neutral-50 px-3 py-2;
}

.composer-row {
  @apply flex items-end gap-2;
}

.composer-input {
  @apply field-sizing-content min-h-7.5 max-h-40 flex-1 resize-none overflow-auto px-3 py-1 text-[13px] leading-5;
}

.composer-actions {
  @apply flex shrink-0 gap-2 self-end;
}

.send-button-content {
  @apply inline-flex items-center gap-1.5;
}

.send-button-label {
  @apply leading-none;
}
</style>
