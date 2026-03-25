<template>
  <section v-if="ui.showLogsPanel" class="logs-panel">
    <header class="logs-panel-header">
      <div class="logs-panel-heading">
        <h2 class="logs-panel-title">Logs</h2>
        <span class="logs-panel-meta">{{ entriesCount }} entries</span>
      </div>
      <div class="logs-panel-actions">
        <UiButton
          class="logs-panel-button"
          size="sm"
          :disabled="entriesCount === 0"
          @click="session.clearDebugLogs()"
        >
          Clear logs
        </UiButton>
        <UiButton
          class="logs-panel-button"
          size="sm"
          @click="ui.showLogsPanel = false"
        >
          Close
        </UiButton>
      </div>
    </header>
    <div ref="logsPanel" class="logs-panel-body" @scroll="updatePinnedState">
      <pre class="logs-panel-text">{{ formattedLogs }}</pre>
    </div>
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { usePinnedScroll } from '../../composables/usePinnedScroll';
import { useDiagnosticsStore } from '../../stores/diagnostics';
import { useSessionStore } from '../../stores/session';
import { useUiStore } from '../../stores/ui';
import { formatDebugLogLine } from '../../utils/chatFormatting';
import UiButton from '../ui/UiButton.vue';

const logsPanelRef = useTemplateRef<HTMLDivElement>('logsPanel');
const logsScroll = usePinnedScroll(logsPanelRef);
const { diagnostics } = storeToRefs(useDiagnosticsStore());
const session = useSessionStore();
const ui = useUiStore();
const entriesCount = computed(() => diagnostics.value.debugLogs.length);
const formattedLogs = computed(() =>
  diagnostics.value.debugLogs.map(formatDebugLogLine).join('\n'),
);

watch(formattedLogs, async () => {
  await nextTick();
  logsScroll.scrollToBottomIfPinned();
});

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
@reference "../../../styles.css";

.logs-panel {
  @apply col-span-2 grid h-56 min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-neutral-300 bg-neutral-950 text-neutral-100;
}

.logs-panel-header {
  @apply flex items-center justify-between border-b border-neutral-700 px-3 py-2;
}

.logs-panel-heading {
  @apply flex items-center gap-2;
}

.logs-panel-title {
  @apply text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-200;
}

.logs-panel-meta {
  @apply text-[11px] text-neutral-400;
}

.logs-panel-actions {
  @apply ml-auto flex items-center gap-2;
}

.logs-panel-button {
  @apply inline-flex items-center;
}

.logs-panel-body {
  @apply min-h-0 overflow-auto px-3 py-2;
}

.logs-panel-text {
  @apply m-0 whitespace-pre-wrap wrap-break-word font-mono text-[11px] leading-5 text-neutral-100;
}
</style>
