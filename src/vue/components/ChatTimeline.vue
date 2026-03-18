<template>
  <template v-for="entry in chatTimelineEntries" :key="entry.id">
    <article v-if="entry.kind === 'message'" :class="messageClasses(entry)">
      <button
        type="button"
        class="message-time message-time-trigger"
        :class="{
          'message-time-trigger-active': canInspectMessage(entry.message),
        }"
        :disabled="!canInspectMessage(entry.message)"
        @click="openInspection(entry.message)"
      >
        [{{ formatMessageTime(entry.message.createdAt) }}]</button
      ><span class="message-separator">{{ messageSeparator }}</span
      ><span
        class="message-sender"
        @dblclick="messageInputState.mentionMessageSender(entry.message)"
        >{{ formatMessageAuthorForTemplate(entry.message) }}</span
      ><template v-if="shouldShowCost(entry.message)">
        <span class="message-separator">{{ messageSeparator }}</span
        ><span class="message-cost">
          <span
            class="message-cost-trigger"
            :class="costSummaryClass(entry.message)"
            @mouseenter="
              overlayControls.openCostBubble(entry.message.id, $event)
            "
            @mouseleave="overlayControls.scheduleCostBubbleClose()"
            >{{ formatMessageCost(displayedCost(entry.message)) }}</span
          >
        </span> </template
      ><span class="message-separator">{{ messageSeparator }}</span
      ><span class="message-text">{{ entry.message.content }}</span>
    </article>
    <article
      v-else-if="entry.kind === 'technical-event'"
      :class="technicalEventClasses(entry.event)"
    >
      <button
        type="button"
        class="message-time message-time-trigger"
        :class="{
          'message-time-trigger-active': canInspectEvent(entry.event),
        }"
        :disabled="!canInspectEvent(entry.event)"
        @click="openEventInspection(entry.event)"
      >
        [{{ formatMessageTime(entry.event.createdAt) }}]</button
      ><span class="message-separator">{{ messageSeparator }}</span
      ><span class="runtime-label">{{
        formatTechnicalEventLabelForTemplate(entry.event)
      }}</span
      ><template v-if="shouldShowCost(entry.event)">
        <span class="message-separator">{{ messageSeparator }}</span
        ><span class="message-cost">
          <span
            class="message-cost-trigger"
            :class="costSummaryClass(entry.event)"
            @mouseenter="overlayControls.openCostBubble(entry.event.id, $event)"
            @mouseleave="overlayControls.scheduleCostBubbleClose()"
            >{{ formatMessageCost(displayedCost(entry.event)) }}</span
          >
        </span> </template
      ><span class="message-separator">{{ messageSeparator }}</span
      ><span class="runtime-text">{{
        formatTechnicalEventText(entry.event)
      }}</span>
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
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import type {
  ChatMessage,
  RuntimeEvent,
  VisibleTimelineEntry,
} from '../../core';
import { useRequestInspection } from '../composables/useRequestInspection';
import { useMessageInputStore } from '../stores/messageInput';
import { useRuntimeStore } from '../stores/runtime';
import { useUiStore } from '../stores/ui';
import { useOverlayControls } from '../useOverlayControls';
import {
  formatMessageAuthor,
  formatMessageTime,
  formatTechnicalEventLabel,
  formatTechnicalEventText,
  technicalEventClasses,
} from '../utils/chatFormatting';
import {
  displayedMessageCost,
  formatMessageCost,
  messageCostSummaryClass,
  shouldShowMessageCost,
} from '../utils/costing';

const runtimeStore = useRuntimeStore();
const runtime = runtimeStore.requireRuntime();
const { state } = storeToRefs(runtimeStore);
const messageInputState = useMessageInputStore();
const overlayControls = useOverlayControls();
const ui = useUiStore();
const inspection = useRequestInspection({
  runtime,
  state,
  ui,
});
const messageSeparator = ' ';
const formatMessageAuthorForTemplate = formatMessageAuthorForView;
const formatTechnicalEventLabelForTemplate = formatTechnicalEventLabelForView;
const human = computed(() =>
  state.value.participants.find((participant) => participant.role === 'human'),
);
const chatTimelineEntries = computed(() =>
  runtime.getVisibleTimelineEntries({
    participantId: human.value?.id ?? 'human',
    filters: {
      showTechnicalEvents: state.value.settings.showSilentDecisions,
      showPreviewCutoffs: state.value.settings.showContextCutoffs,
    },
  }),
);

function canInspectMessage(message: ChatMessage) {
  return inspection.canInspectMessage(message);
}

function displayedCost(
  item: Parameters<typeof displayedMessageCost>[0],
): number {
  return displayedMessageCost(item, state.value.settings.costDisplayMode);
}

function shouldShowCost(
  item: Parameters<typeof shouldShowMessageCost>[0],
): boolean {
  return shouldShowMessageCost(item, state.value.settings.costDisplayMode);
}

function costSummaryClass(
  item: Parameters<typeof messageCostSummaryClass>[0],
): string {
  return messageCostSummaryClass(item, state.value.settings.costDisplayMode);
}

function openInspection(message: ChatMessage) {
  if (!canInspectMessage(message)) {
    return;
  }

  if (message.senderId === 'human') {
    const subject = inspection.getInspectionSubjectForMessage(message.id);
    if (subject.downstreamTraces.length === 1) {
      inspection.openForTrace(subject.downstreamTraces[0]!.id, message.id);
      return;
    }

    inspection.openForMessage(message.id);
    return;
  }

  if (message.sourceTraceId) {
    inspection.openForTrace(message.sourceTraceId, message.id);
  }
}

function canInspectEvent(event: RuntimeEvent) {
  return Boolean(event.sourceTraceId);
}

function openEventInspection(event: RuntimeEvent) {
  if (!event.sourceTraceId) {
    return;
  }

  inspection.openForTrace(event.sourceTraceId);
}

function formatMessageAuthorForView(message: ChatMessage) {
  return formatMessageAuthor(message, {
    byId: participantNameById,
  });
}

function formatTechnicalEventLabelForView(event: RuntimeEvent) {
  return formatTechnicalEventLabel(event, {
    byId: participantNameById,
  });
}

function messageClasses(
  entry: Extract<VisibleTimelineEntry, { kind: 'message' }>,
): string {
  const baseClass =
    entry.message.target === 'private'
      ? 'message-line-private'
      : 'message-line';

  return entry.isMuted ? `${baseClass} message-line-muted` : baseClass;
}

function participantNameById(participantId: string): string | null {
  return (
    state.value.participants.find(
      (participant) => participant.id === participantId,
    )?.name ?? null
  );
}
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
  @apply block whitespace-pre-wrap break-words text-[13px] leading-6;
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

.message-time-trigger {
  @apply cursor-default border-0 bg-transparent p-0 text-current;
}

.message-time-trigger-active {
  @apply cursor-pointer rounded transition-colors hover:bg-neutral-200/80;
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
