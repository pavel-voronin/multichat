<template>
  <div
    class="cutoff-banner cutoff-banner-manual"
    :class="{
      'cutoff-banner-dragging': draggedCutoffId === entry.id,
      'cutoff-banner-drop-target': dragPreviewTargetId === entry.id,
    }"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <span
      class="cutoff-drag-handle"
      role="button"
      tabindex="0"
      aria-label="Drag topic break"
      @pointerdown="drag.startDrag($event, entry.id)"
      @keydown.enter.prevent
      @keydown.space.prevent
    >
      <IconMdiDragVertical class="cutoff-drag-icon" aria-hidden="true" /> </span
    ><span class="cutoff-title">New topic starts below.</span>{{ ' '
    }}<span class="cutoff-manual-copy"
      >Messages above stay visible but are excluded from agent context.</span
    >{{ ' '
    }}<span
      class="cutoff-link"
      role="button"
      tabindex="0"
      @click="session.clearHistoryBeforeAgentCutoff()"
      @keydown.enter="session.clearHistoryBeforeAgentCutoff()"
      @keydown.space.prevent="session.clearHistoryBeforeAgentCutoff()"
      >Delete messages above</span
    >{{ ' '
    }}<span
      class="cutoff-link cutoff-link-secondary"
      role="button"
      tabindex="0"
      @click="session.removeManualCutoff()"
      @keydown.enter="session.removeManualCutoff()"
      @keydown.space.prevent="session.removeManualCutoff()"
      >Remove topic break</span
    >
  </div>
</template>

<script setup lang="ts">
import IconMdiDragVertical from '~icons/mdi/drag-vertical';
import type { VisibleHistoryCutoffEntry } from '../../types';
import { useSessionStore } from '../../stores/session';
import { useCutoffDrag } from '../../composables/useCutoffDrag';

defineProps<{
  entry: VisibleHistoryCutoffEntry;
  draggedCutoffId: string | null;
  dragPreviewTargetId: string | null | undefined;
}>();

const session = useSessionStore();
const drag = useCutoffDrag();
</script>

<style scoped>
@reference "../../../styles.css";

.cutoff-banner {
  @apply relative isolate block min-h-6 overflow-hidden break-words bg-white text-[13px] leading-6;
}

.cutoff-banner-manual {
  @apply w-full text-left text-amber-800/80;
}

.cutoff-banner-dragging {
  @apply cursor-grabbing;
}

.cutoff-banner-drop-target::after {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}

.cutoff-drag-handle {
  @apply relative top-[1px] z-[1] inline-block w-4 cursor-grab align-baseline text-amber-900/80;
  touch-action: none;
}

.cutoff-drag-handle:active {
  @apply cursor-grabbing;
}

.cutoff-drag-icon {
  @apply inline h-[1em] w-[1em] align-baseline;
}

.cutoff-title {
  @apply font-semibold text-current;
}

.cutoff-manual-copy {
  @apply text-current;
}

.cutoff-link {
  @apply inline cursor-pointer font-medium text-amber-900 underline decoration-amber-700/60 underline-offset-2;
}

.cutoff-link:hover {
  @apply text-amber-950 decoration-amber-900;
}

.cutoff-link-secondary {
  @apply text-neutral-600 decoration-neutral-500/60;
}

.cutoff-link-secondary:hover {
  @apply text-neutral-700 decoration-neutral-600;
}
</style>
