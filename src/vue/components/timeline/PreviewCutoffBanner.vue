<template>
  <div
    class="cutoff-banner cutoff-banner-preview"
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
        class="cutoff-drag-handle cutoff-drag-handle-preview"
        aria-label="Drag context border"
        @pointerdown="drag.startDrag($event, entry.id)"
      >
        <IconMdiDragVertical class="cutoff-drag-icon" aria-hidden="true" />
      </button>
    </span>
    <span class="cutoff-copy">{{ entry.cutoff.label }}</span>
    <span class="cutoff-tail cutoff-tail-preview" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import IconMdiDragVertical from '~icons/mdi/drag-vertical';
import type { TimelinePreviewCutoffEntry } from '../../types';
import { useCutoffDrag } from '../../composables/useCutoffDrag';

defineProps<{
  entry: TimelinePreviewCutoffEntry;
  draggedCutoffId: string | null;
  dragPreviewTargetId: string | null | undefined;
}>();

const drag = useCutoffDrag();
</script>

<style scoped>
@reference "../../../styles.css";

.cutoff-banner {
  @apply relative isolate flex min-h-6 items-center overflow-hidden text-[13px] leading-6;
}

.cutoff-banner-preview {
  @apply w-full text-left text-red-800/65;
}

.cutoff-banner-preview::before {
  content: '';
  @apply absolute left-0 right-0 top-1/2 border-t border-dashed border-red-500/45;
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

.cutoff-drag-handle-preview {
  @apply text-red-800/65;
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

.cutoff-tail {
  @apply min-w-0 flex-1 border-t border-dashed border-amber-500/45;
}

.cutoff-tail-preview {
  @apply border-red-500/45;
}
</style>
