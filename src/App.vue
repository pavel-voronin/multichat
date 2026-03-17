<template>
  <main class="app-shell">
    <MultiAgentChat />
  </main>
</template>

<script setup lang="ts">
import { MultiAgentChat } from './vue';
</script>

<style scoped>
@reference "./styles.css";

.app-shell {
  @apply h-screen overflow-hidden bg-neutral-100 text-neutral-950;
}
</style>
