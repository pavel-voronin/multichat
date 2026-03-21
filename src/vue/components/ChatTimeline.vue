<template>
  <div class="timeline-root" :class="{ 'timeline-root--dragging': drag.isDragging.value }">
    <template v-for="entry in renderedTimelineEntries" :key="entry.id">
      <MessageEntry
        v-if="entry.kind === 'message'"
        :entry="entry"
        :drag-preview-target-id="drag.dragPreviewTargetId.value"
        :cost-display-mode="preferences.costDisplayMode"
      />
      <TechnicalEventEntry
        v-else-if="entry.kind === 'technical-event'"
        :entry="entry"
        :drag-preview-target-id="drag.dragPreviewTargetId.value"
        :cost-display-mode="preferences.costDisplayMode"
      />
      <ManualCutoffBanner
        v-else-if="entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual'"
        :entry="(entry as VisibleTimelineManualCutoffEntry)"
        :dragged-cutoff-id="drag.draggedCutoffId.value"
        :drag-preview-target-id="drag.dragPreviewTargetId.value"
      />
      <PreviewCutoffBanner
        v-else-if="entry.kind === 'history-cutoff' && entry.cutoff.source === 'preview'"
        :entry="(entry as TimelinePreviewCutoffEntry)"
        :dragged-cutoff-id="drag.draggedCutoffId.value"
        :drag-preview-target-id="drag.dragPreviewTargetId.value"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useCutoffDrag } from '../composables/useCutoffDrag';
import { useTimelineStore } from '../stores/timeline';
import type { VisibleTimelineManualCutoffEntry, TimelinePreviewCutoffEntry } from '../types';
import ManualCutoffBanner from './timeline/ManualCutoffBanner.vue';
import MessageEntry from './timeline/MessageEntry.vue';
import PreviewCutoffBanner from './timeline/PreviewCutoffBanner.vue';
import TechnicalEventEntry from './timeline/TechnicalEventEntry.vue';

const timelineStore = useTimelineStore();
const { visibleTimelineEntries, preferences } = storeToRefs(timelineStore);
const drag = useCutoffDrag();

const renderedTimelineEntries = computed(() =>
  drag.reorderEntriesForDragPreview(
    visibleTimelineEntries.value,
    drag.draggedCutoffId.value,
    drag.dragPreviewTargetId.value,
  ),
);

onBeforeUnmount(() => {
  drag.stopDrag();
});
</script>

<style scoped>
@reference "../../styles.css";

.timeline-root--dragging {
  @apply cursor-grabbing select-none;
}
</style>

<!-- Note: the original `cutoff-stack` wrapper had `grid gap-1` but always contained exactly
     one child (manual OR preview banner, never both), so `gap-1` had no visual effect.
     No spacing is added to `timeline-root`. -->
