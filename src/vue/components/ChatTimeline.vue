<template>
  <template v-for="entry in chatTimelineEntries" :key="entry.id">
      <article v-if="entry.kind === 'message'" :class="messageClasses(entry)">
        <span class="message-time"
          >[{{ formatMessageTime(entry.message.createdAt) }}]</span
        ><span class="message-separator">{{ messageSeparator }}</span
        ><span
          class="message-sender"
          @dblclick="composerState.mentionMessageSender(entry.message)"
          >{{ formatMessageAuthor(entry.message) }}</span
        ><template v-if="shouldShowMessageCost(entry.message)">
          <span class="message-separator">{{ messageSeparator }}</span
          ><span class="message-cost">
            <span
              class="message-cost-trigger"
              :class="messageCostSummaryClass(entry.message)"
              @mouseenter="
                overlayControls.openCostBubble(entry.message.id, $event)
              "
              @mouseleave="overlayControls.scheduleCostBubbleClose()"
              >{{ formatMessageCost(displayedMessageCost(entry.message)) }}</span
            >
          </span>
        </template
        ><span class="message-separator">{{ messageSeparator }}</span
        ><span class="message-text">{{ entry.message.content }}</span>
      </article>
      <article
        v-else-if="entry.kind === 'technical-event'"
        :class="technicalEventClasses(entry.event)"
      >
        <span class="message-time"
          >[{{ formatMessageTime(entry.event.createdAt) }}]</span
        ><span class="message-separator">{{ messageSeparator }}</span
        ><span class="runtime-label">{{
          formatTechnicalEventLabel(entry.event)
        }}</span
        ><span class="message-separator">{{ messageSeparator }}</span
        ><span class="runtime-text">{{ formatTechnicalEventText(entry.event) }}</span>
      </article>

      <div v-else class="cutoff-stack">
        <div
          v-if="entry.cutoff.source === 'manual'"
          class="cutoff-banner cutoff-banner-manual"
        >
          <span class="cutoff-copy">
            <span class="cutoff-title">History cleared for agents</span>
            <span class="cutoff-manual-copy">
              Messages above stay visible but are excluded from agent context.
            </span>
            <button
              type="button"
              class="cutoff-link"
              @click="runtime.clearHistoryBeforeAgentCutoff()"
            >
              Clear chat history
            </button>
          </span>
        </div>

        <div v-else class="cutoff-banner cutoff-banner-preview">
          <span class="cutoff-copy">{{ entry.cutoff.label }}</span>
        </div>
      </div>
  </template>
</template>

<script setup lang="ts">
import { useChatViewModel } from '../composables/useChatViewModel';
import { useComposerState } from '../useComposerState';
import { useOverlayControls } from '../useOverlayControls';
import { useRuntime } from '../useRuntime';
import { useRuntimeState } from '../useRuntimeState';
import {
  formatMessageTime,
  formatTechnicalEventText,
  technicalEventClasses,
} from '../utils/chatFormatting';
import { formatMessageCost } from '../utils/costing';

const runtime = useRuntime();
const state = useRuntimeState(runtime);
const composerState = useComposerState();
const overlayControls = useOverlayControls();
const chatViewModel = useChatViewModel({
  state,
  runtime,
});
const messageSeparator = ' ';
const chatTimelineEntries = chatViewModel.chatTimelineEntries;
const formatMessageAuthor = chatViewModel.formatMessageAuthorForView;
const formatTechnicalEventLabel = chatViewModel.formatTechnicalEventLabelForView;
const displayedMessageCost = chatViewModel.displayedMessageCost;
const shouldShowMessageCost = chatViewModel.shouldShowMessageCost;
const messageCostSummaryClass = chatViewModel.messageCostSummaryClass;
const messageClasses = chatViewModel.messageClasses;
</script>

<style scoped>
@reference "../../styles.css";

.message-line {
  @apply block whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-800;
}

.message-line-private {
  @apply block whitespace-pre-wrap break-words text-[13px] leading-6 text-orange-700 italic;
}

.runtime-line {
  @apply block whitespace-pre-wrap break-words text-[12px] leading-5;
}

.runtime-line-silent {
  @apply text-sky-800;
}

.runtime-line-error {
  @apply text-red-800;
}

.message-line-muted {
  @apply text-neutral-500;
}

.message-time {
  @apply text-neutral-500;
}

.message-sender {
  @apply whitespace-nowrap rounded font-semibold text-neutral-700 transition-colors hover:bg-neutral-200/80;
}

.runtime-label {
  @apply font-semibold text-sky-900;
}

.runtime-line-error .runtime-label {
  @apply text-red-900;
}

.message-separator {
  @apply whitespace-pre;
}

.message-cost {
  @apply relative inline;
}

.message-cost-trigger {
  @apply cursor-default rounded;
}

.message-cost-request {
  @apply text-emerald-700;
}

.message-cost-total {
  @apply text-green-800;
}

.message-cost-net {
  @apply text-teal-700;
}

.message-text {
  @apply text-current;
}

.runtime-text {
  @apply text-current;
}

.cutoff-stack {
  @apply grid gap-1;
}

.cutoff-banner {
  @apply relative isolate flex h-5 items-center overflow-hidden text-[11px] leading-5;
}

.cutoff-banner-preview {
  @apply w-full text-left text-red-800/65;
}

.cutoff-banner-manual {
  @apply w-full text-left text-amber-800/80;
}

.cutoff-banner-preview::before {
  content: '';
  @apply absolute left-0 right-0 top-1/2 border-t border-dashed border-red-500/45;
}

.cutoff-banner-manual::before {
  content: '';
  @apply absolute left-0 right-0 top-1/2 border-t border-dashed border-amber-500/45;
}

.cutoff-title {
  @apply font-semibold text-current;
}

.cutoff-copy {
  @apply relative z-[1] ml-2 bg-white px-1;
}

.cutoff-manual-copy {
  @apply ml-2;
}

.cutoff-link {
  @apply ml-2 cursor-pointer border-0 bg-transparent p-0 text-[11px] font-medium text-amber-900 underline decoration-amber-700/60 underline-offset-2;
}

.cutoff-link:hover {
  @apply text-amber-950 decoration-amber-900;
}
</style>
