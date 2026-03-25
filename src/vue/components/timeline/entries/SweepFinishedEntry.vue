<template>
  <article
    class="entry-article"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <div class="runtime-line runtime-line-sweep">
      <span class="chat-line-time">[{{ timeLabel }}]</span>{{ ' '
      }}<span class="runtime-label">{{ label }}</span
      ><template v-if="showCost"
        >{{ ' '
        }}<CostBadge
          :item="entry"
          :item-id="entry.id"
          :cost-display-mode="costDisplayMode" /></template
      >{{ ' ' }}<span class="runtime-text">sweep finished</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SweepFinishedEntry } from '../../../../core';
import { useCutoffDrag } from '../../../composables/useCutoffDrag';
import { useEntryCost } from '../../../composables/useEntryCost';
import { useTimelineStore } from '../../../stores/timeline';
import { formatMessageTime } from '../../../utils/chatFormatting';
import CostBadge from '../CostBadge.vue';

const props = defineProps<{
  entry: SweepFinishedEntry & { isMuted: boolean };
}>();
const drag = useCutoffDrag();
const dragPreviewTargetId = drag.dragPreviewTargetId;
const timeline = useTimelineStore();
const { showCost, costDisplayMode } = useEntryCost(props.entry);
const timeLabel = computed(() => formatMessageTime(props.entry.createdAt));
const label = computed(() => {
  if (!props.entry.agentId) return '[sweep]';
  const name = timeline.participantNameById(props.entry.agentId);
  return name ? `[${name}]` : '[sweep]';
});
</script>

<style scoped>
@reference "@styles";

.entry-article {
  @apply relative;
}

.runtime-line {
  @apply block break-words text-[13px] leading-6;
}

.runtime-line-sweep {
  @apply text-neutral-400;
}

.runtime-label {
  @apply font-semibold;
}

.runtime-text {
  @apply text-current;
}

.chat-line-time {
  @apply text-neutral-400;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
