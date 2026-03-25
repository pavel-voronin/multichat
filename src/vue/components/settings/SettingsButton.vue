<template>
  <UiButton class="settings-button" size="md" @click="ui.showSettings = true">
    Settings
  </UiButton>
</template>

<script setup lang="ts">
import { useUiStore } from '../../stores/ui';
import UiButton from '../ui/UiButton.vue';

const ui = useUiStore();
</script>

<style scoped>
@reference "@styles";

.settings-button {
  @apply inline-flex h-7 items-center;
  transform: translateY(-1px);
}
</style>
