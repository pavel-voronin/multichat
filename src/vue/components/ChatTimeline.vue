<template>
  <div
    class="timeline-root"
    :class="{ 'timeline-root--dragging': drag.isDragging.value }"
  >
    <template v-for="entry in renderedTimelineEntries" :key="entry.id">
      <ManualCutoffBanner
        v-if="entry.kind === 'history-cutoff'"
        :entry="entry"
        :dragged-cutoff-id="drag.draggedCutoffId.value"
        :drag-preview-target-id="drag.dragPreviewTargetId.value"
      />
      <component v-else :is="entryRegistry[entry.kind]" :entry="entry" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useCutoffDrag } from '../composables/useCutoffDrag';
import { useTimelineStore } from '../stores/timeline';
import ManualCutoffBanner from './timeline/ManualCutoffBanner.vue';
import { entryRegistry } from './timeline/entryRegistry';

const timelineStore = useTimelineStore();
const { visibleTimelineEntries } = storeToRefs(timelineStore);
const drag = useCutoffDrag();

const renderedTimelineEntries = computed(() =>
  drag.reorderEntriesForDrag(
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

.timeline-root {
  @apply whitespace-pre-wrap;
}

.timeline-root--dragging {
  @apply cursor-grabbing select-none;
}
</style>
