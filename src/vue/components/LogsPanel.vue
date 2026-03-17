<template>
  <section v-if="ui.showLogsPanel" class="logs-panel">
    <header class="logs-panel-header">
      <h2 class="logs-panel-title">Logs</h2>
      <span class="logs-panel-meta">{{ entriesCount }} entries</span>
    </header>
    <div ref="logsPanel" class="logs-panel-body" @scroll="updatePinnedState">
      <pre class="logs-panel-text">{{ formattedLogs }}</pre>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { usePinnedScroll } from '../composables/usePinnedScroll';
import { useUiState } from '../useUiState';
import { useRuntime } from '../useRuntime';
import { useRuntimeState } from '../useRuntimeState';
import { formatDebugLogLine } from '../utils/chatFormatting';

const logsPanelRef = useTemplateRef<HTMLDivElement>('logsPanel');
const logsScroll = usePinnedScroll(logsPanelRef);
const runtime = useRuntime();
const state = useRuntimeState(runtime);
const ui = useUiState();
const entriesCount = computed(() => state.value.debugLogs.length);
const formattedLogs = computed(() =>
  state.value.debugLogs.map(formatDebugLogLine).join('\n'),
);

watch(
  formattedLogs,
  async () => {
    await nextTick();
    logsScroll.scrollToBottomIfPinned();
  },
);

watch(
  () => ui.showLogsPanel,
  async (isOpen) => {
    if (!isOpen) {
      return;
    }
    logsScroll.pinToBottom();
    await nextTick();
    logsScroll.scrollToBottomIfPinned();
  },
);

function updatePinnedState() {
  logsScroll.updatePinnedState();
}
</script>

<style scoped>
@reference "../../styles.css";

.logs-panel {
  @apply col-span-2 grid h-56 min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-neutral-300 bg-neutral-950 text-neutral-100;
}

.logs-panel-header {
  @apply flex items-center justify-between border-b border-neutral-700 px-3 py-2;
}

.logs-panel-title {
  @apply text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-200;
}

.logs-panel-meta {
  @apply text-[11px] text-neutral-400;
}

.logs-panel-body {
  @apply min-h-0 overflow-auto px-3 py-2;
}

.logs-panel-text {
  @apply m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-neutral-100;
}
</style>
