<template>
  <Teleport to="body">
    <div v-if="open" class="ui-modal-backdrop" @click.self="emit('close')">
      <div
        class="ui-modal-card"
        :class="[widthClass, { 'ui-modal-card-expanded': props.expanded }]"
      >
        <header class="ui-modal-titlebar">
          <div class="ui-modal-title-slot">
            <slot name="title" />
          </div>
          <div class="ui-modal-header-actions">
            <slot name="header-actions" />
            <button
              type="button"
              class="ui-modal-close"
              aria-label="Close"
              @click="emit('close')"
            >
              ✕
            </button>
          </div>
        </header>
        <div class="ui-modal-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import {
  registerModal as registerModalInStack,
  unregisterModal as unregisterModalFromStack,
} from './modalStack';

const props = withDefaults(
  defineProps<{
    open: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'wide';
    expanded?: boolean;
  }>(),
  {
    size: 'md',
    expanded: false,
  },
);

const emit = defineEmits<{
  close: [];
}>();

const modalToken = Symbol('ui-modal');

const widthClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'max-w-md';
    case 'md':
      return 'max-w-xl';
    case 'lg':
      return 'max-w-2xl';
    case 'xl':
      return 'max-w-4xl';
    case 'wide':
      return 'max-w-[818px]';
  }
});

function registerCurrentModal(): void {
  registerModalInStack(modalToken, () => {
    if (!props.open) return;
    emit('close');
  });
}

function unregisterCurrentModal(): void {
  unregisterModalFromStack(modalToken);
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      registerCurrentModal();
      return;
    }

    unregisterCurrentModal();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  unregisterCurrentModal();
});
</script>

<style scoped>
@reference "../../../styles.css";

.ui-modal-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/20 p-4 backdrop-blur-sm;
}

.ui-modal-card {
  @apply flex max-h-[min(90vh,48rem)] w-full flex-col overflow-hidden rounded-md border border-neutral-300 bg-white text-[13px] text-neutral-900 shadow-xl;
}

.ui-modal-card-expanded {
  @apply h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)];
}

.ui-modal-titlebar {
  @apply flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3;
}

.ui-modal-title-slot {
  @apply min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap;
}

.ui-modal-header-actions {
  @apply -mr-1 flex shrink-0 items-center gap-2;
}

.ui-modal-close {
  @apply flex h-7 w-7 items-center justify-center rounded text-base leading-none text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}

.ui-modal-body {
  @apply min-h-0 flex-1 overflow-auto;
}
</style>
