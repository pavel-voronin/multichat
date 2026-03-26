<template>
  <UiModal :open="ui.showWelcomeModal" size="md" @close="close">
    <template #title>
      <h2 class="welcome-dialog-title">Welcome to Multichat</h2>
    </template>

    <div class="welcome-dialog-body" />
  </UiModal>
</template>

<script setup lang="ts">
import { useUiStore } from '../../stores/ui';
import UiModal from '../ui/UiModal.vue';

const ui = useUiStore();

function close(): void {
  ui.showWelcomeModal = false;
}
</script>

<style scoped>
@reference "@styles";

.welcome-dialog-title {
  @apply m-0 text-base font-semibold;
}

.welcome-dialog-body {
  @apply min-h-40 px-5 py-5;
}
</style>
