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
    <span class="cutoff-controls">
      <button
        type="button"
        class="cutoff-drag-handle"
        aria-label="Drag topic break"
        @pointerdown="drag.startDrag($event, entry.id)"
      >
        <IconMdiDragVertical class="cutoff-drag-icon" aria-hidden="true" />
      </button>
    </span>
    <span class="cutoff-copy">
      <span class="cutoff-title">New topic starts below.</span>
      <span class="cutoff-manual-copy">
        Messages above stay visible but are excluded from agent context.
      </span>
      <button
        type="button"
        class="cutoff-link"
        @click="session.clearHistoryBeforeAgentCutoff()"
      >
        Delete messages above
      </button>
      <span class="cutoff-link-gap" aria-hidden="true">&nbsp;&nbsp;</span>
      <button
        type="button"
        class="cutoff-link cutoff-link-secondary"
        @click="session.removeManualCutoff()"
      >
        Remove topic break
      </button>
      <span class="cutoff-link-gap" aria-hidden="true">&nbsp;</span>
    </span>
    <span class="cutoff-tail" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import IconMdiDragVertical from '~icons/mdi/drag-vertical';
import type { VisibleTimelineManualCutoffEntry } from '../../types';
import { useSessionStore } from '../../stores/session';
import { useCutoffDrag } from '../../composables/useCutoffDrag';

defineProps<{
  entry: VisibleTimelineManualCutoffEntry;
  draggedCutoffId: string | null;
  dragPreviewTargetId: string | null | undefined;
}>();

const session = useSessionStore();
const drag = useCutoffDrag();
</script>

<style scoped>
@reference "../../../styles.css";

.cutoff-banner {
  @apply relative isolate flex min-h-6 items-center overflow-hidden text-[13px] leading-6;
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

.cutoff-controls {
  @apply relative z-[1] flex shrink-0 items-center bg-white;
}

.cutoff-drag-handle {
  @apply relative z-[1] -ml-1 inline-flex h-5 cursor-grab items-center justify-start border-0 bg-white p-0 text-amber-900/80;
  touch-action: none;
}

.cutoff-drag-handle:active {
  @apply cursor-grabbing;
}

.cutoff-drag-icon {
  @apply h-4 w-4;
}

.cutoff-copy {
  @apply relative z-[1] shrink-0 bg-white px-0.5 pr-1;
}

.cutoff-title {
  @apply font-semibold text-current;
}

.cutoff-link {
  @apply ml-2 cursor-pointer border-0 bg-transparent p-0 font-medium text-amber-900 underline decoration-amber-700/60 underline-offset-2;
}

.cutoff-link:hover {
  @apply text-amber-950 decoration-amber-900;
}

.cutoff-link-secondary {
  @apply ml-0 text-neutral-600 decoration-neutral-500/60;
}

.cutoff-link-secondary:hover {
  @apply text-neutral-700 decoration-neutral-600;
}

.cutoff-link-gap {
  @apply whitespace-pre;
}

.cutoff-tail {
  @apply min-w-0 flex-1 border-t border-dashed border-amber-500/45;
}
</style>
