<template>
  <template v-for="entry in renderedTimelineEntries" :key="entry.id">
    <article
      v-if="entry.kind === 'message'"
      :class="messageClasses(entry)"
      :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
      data-manual-cutoff-drop-target="true"
      :data-timeline-entry-id="entry.id"
    >
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
      ><template v-if="!isSystemMessageForTemplate(entry.message)">
        <span class="message-separator">{{ messageSeparator }}</span
        ><span
          class="message-sender"
          @dblclick="messageInputState.mentionMessageSender(entry.message)"
          >{{ formatMessageAuthorForTemplate(entry.message) }}</span
        ></template
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
      :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
      data-manual-cutoff-drop-target="true"
      :data-timeline-entry-id="entry.id"
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
        :class="{
          'cutoff-banner-dragging': draggedCutoffId === entry.id,
          'cutoff-banner-drop-target': dragPreviewTargetId === entry.id,
        }"
        data-manual-cutoff-drop-target="true"
        :data-timeline-entry-id="entry.id"
      >
        <span class="cutoff-controls">
          <button
            type="button"
            class="cutoff-drag-handle"
            aria-label="Drag context cut-off"
            @pointerdown="startManualCutoffDrag($event, entry.id)"
          >
            <IconMdiDragVertical class="cutoff-drag-icon" aria-hidden="true" />
          </button>
        </span>
        <span class="cutoff-copy">
          <span class="cutoff-title">Context starts below.</span>
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
            Remove cut-off
          </button>
          <span class="cutoff-link-gap" aria-hidden="true">&nbsp;</span>
        </span>
        <span class="cutoff-tail" aria-hidden="true" />
      </div>

      <div
        v-else
        class="cutoff-banner cutoff-banner-preview"
        :class="{
          'cutoff-banner-dragging': draggedCutoffId === entry.id,
          'cutoff-banner-drop-target': dragPreviewTargetId === entry.id,
        }"
        data-manual-cutoff-drop-target="true"
        :data-timeline-entry-id="entry.id"
      >
        <span class="cutoff-controls">
          <button
            type="button"
            class="cutoff-drag-handle cutoff-drag-handle-preview"
            aria-label="Drag context border"
            @pointerdown="startPreviewCutoffDrag($event, entry.id)"
          >
            <IconMdiDragVertical class="cutoff-drag-icon" aria-hidden="true" />
          </button>
        </span>
        <span class="cutoff-copy">{{ entry.cutoff.label }}</span>
        <span class="cutoff-tail cutoff-tail-preview" aria-hidden="true" />
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, ref } from 'vue';
import IconMdiDragVertical from '~icons/mdi/drag-vertical';
import {
  getMessageSenderId,
  type ChatMessage,
  type RuntimeEvent,
} from '../../core';
import { useInspectionStore } from '../stores/inspection';
import { useMessageInputStore } from '../stores/messageInput';
import { useSessionStore } from '../stores/session';
import { useTimelineStore } from '../stores/timeline';
import type {
  TimelinePreviewCutoffEntry,
  VisibleTimelineEntry,
} from '../types';
import { useOverlayControls } from '../useOverlayControls';
import {
  formatMessageAuthor,
  formatMessageTime,
  formatTechnicalEventLabel,
  formatTechnicalEventText,
  isSystemMessage,
  technicalEventClasses,
} from '../utils/chatFormatting';
import {
  displayedMessageCost,
  formatMessageCost,
  messageCostSummaryClass,
  shouldShowMessageCost,
} from '../utils/costing';

const timelineStore = useTimelineStore();
const session = useSessionStore();
const inspection = useInspectionStore();
const { state, preferences, visibleTimelineEntries } =
  storeToRefs(timelineStore);
const messageInputState = useMessageInputStore();
const overlayControls = useOverlayControls();
const messageSeparator = ' ';
const formatMessageAuthorForTemplate = formatMessageAuthorForView;
const formatTechnicalEventLabelForTemplate = formatTechnicalEventLabelForView;
const isSystemMessageForTemplate = isSystemMessageForView;
const chatTimelineEntries = visibleTimelineEntries;
const renderedTimelineEntries = computed(() =>
  reorderEntriesForDragPreview(
    chatTimelineEntries.value,
    draggedCutoffId.value,
    dragPreviewTargetId.value,
  ),
);
const draggedCutoffId = ref<string | null>(null);
const dragPreviewTargetId = ref<string | null | undefined>(undefined);
let activePointerId: number | null = null;

function canInspectMessage(message: ChatMessage) {
  return inspection.canInspectMessage(message);
}

function displayedCost(
  item: Parameters<typeof displayedMessageCost>[0],
): number {
  return displayedMessageCost(item, preferences.value.costDisplayMode);
}

function shouldShowCost(
  item: Parameters<typeof shouldShowMessageCost>[0],
): boolean {
  return shouldShowMessageCost(item, preferences.value.costDisplayMode);
}

function costSummaryClass(
  item: Parameters<typeof messageCostSummaryClass>[0],
): string {
  return messageCostSummaryClass(item, preferences.value.costDisplayMode);
}

function openInspection(message: ChatMessage) {
  if (!canInspectMessage(message)) {
    return;
  }

  if (getMessageSenderId(message) === 'human') {
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
  return timelineStore.canInspectEvent(event);
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

function isSystemMessageForView(message: ChatMessage): boolean {
  return isSystemMessage(message);
}

function messageClasses(
  entry: Extract<VisibleTimelineEntry, { kind: 'message' }>,
): string {
  const baseClass = isSystemMessage(entry.message)
    ? 'message-line-system'
    : entry.message.target === 'private'
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

function startManualCutoffDrag(event: PointerEvent, cutoffId: string): void {
  startCutoffDrag(event, cutoffId);
}

function startPreviewCutoffDrag(event: PointerEvent, cutoffId: string): void {
  startCutoffDrag(event, cutoffId);
}

function startCutoffDrag(event: PointerEvent, cutoffId: string): void {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  draggedCutoffId.value = cutoffId;
  activePointerId = event.pointerId;
  const handle = event.currentTarget as HTMLElement | null;
  dragPreviewTargetId.value = resolveCutoffDropTarget(
    event.clientX,
    event.clientY,
    cutoffId,
  );
  document.body.classList.add('cutoff-drag-active');
  handle?.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', updateManualCutoffDrag);
  window.addEventListener('pointerup', finishManualCutoffDrag);
  window.addEventListener('pointercancel', cancelManualCutoffDrag);
}

function updateManualCutoffDrag(event: PointerEvent): void {
  if (!draggedCutoffId.value || activePointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const draggedEntry = chatTimelineEntries.value.find(
    (entry) => entry.id === draggedCutoffId.value,
  );
  if (draggedEntry?.kind !== 'history-cutoff') {
    return;
  }

  dragPreviewTargetId.value = resolveCutoffDropTarget(
    event.clientX,
    event.clientY,
    draggedCutoffId.value,
  );
}

function finishManualCutoffDrag(event: PointerEvent): void {
  if (!draggedCutoffId.value || activePointerId !== event.pointerId) {
    return;
  }

  const draggedEntry = chatTimelineEntries.value.find(
    (entry) => entry.id === draggedCutoffId.value,
  );
  if (draggedEntry?.kind !== 'history-cutoff') {
    stopManualCutoffDrag();
    return;
  }

  const targetEntryId = resolveCutoffDropTarget(
    event.clientX,
    event.clientY,
    draggedCutoffId.value,
  );

  if (draggedEntry.cutoff.source === 'manual') {
    if (targetEntryId === undefined) {
      session.removeManualCutoff();
    } else {
      session.moveManualCutoffBefore(targetEntryId);
    }
  } else {
    if (targetEntryId === undefined) {
      stopManualCutoffDrag();
      return;
    }

    const nextContextWindowSize = resolveContextWindowSizeFromDropTarget(
      renderedTimelineEntries.value,
      targetEntryId,
    );
    if (nextContextWindowSize !== null) {
      session.updateContextWindowSize(nextContextWindowSize);
    }
  }

  stopManualCutoffDrag();
}

function cancelManualCutoffDrag(): void {
  stopManualCutoffDrag();
}

function stopManualCutoffDrag(): void {
  draggedCutoffId.value = null;
  activePointerId = null;
  dragPreviewTargetId.value = undefined;
  document.body.classList.remove('cutoff-drag-active');
  window.removeEventListener('pointermove', updateManualCutoffDrag);
  window.removeEventListener('pointerup', finishManualCutoffDrag);
  window.removeEventListener('pointercancel', cancelManualCutoffDrag);
}

function resolveCutoffDropTarget(
  clientX: number,
  clientY: number,
  cutoffId: string,
): string | null | undefined {
  const chatLog = document.querySelector<HTMLElement>('.chat-log');
  if (!chatLog) {
    return undefined;
  }

  const chatLogRect = chatLog.getBoundingClientRect();
  const isInsideChatLog =
    clientX >= chatLogRect.left &&
    clientX <= chatLogRect.right &&
    clientY >= chatLogRect.top &&
    clientY <= chatLogRect.bottom;
  if (!isInsideChatLog) {
    return undefined;
  }

  const dropTargets = Array.from(
    chatLog.querySelectorAll<HTMLElement>(
      '[data-manual-cutoff-drop-target="true"]',
    ),
  ).filter((element) => element.dataset.timelineEntryId !== cutoffId);

  for (const element of dropTargets) {
    const rect = element.getBoundingClientRect();
    if (clientY <= rect.top + rect.height / 2) {
      return element.dataset.timelineEntryId ?? null;
    }
  }

  return null;
}

function resolveContextWindowSizeFromDropTarget(
  entries: VisibleTimelineEntry[],
  targetEntryId: string | null | undefined,
): number | null {
  const previewEntry = entries.find(
    (entry): entry is TimelinePreviewCutoffEntry =>
      entry.kind === 'history-cutoff' && entry.cutoff.source === 'preview',
  );
  if (!previewEntry) {
    return null;
  }

  const entriesWithoutPreview = entries.filter(
    (entry) => entry.id !== previewEntry.id,
  );
  const reorderedEntries =
    targetEntryId === null
      ? [...entriesWithoutPreview, previewEntry]
      : targetEntryId === undefined
        ? entries
        : (() => {
            const targetIndex = entriesWithoutPreview.findIndex(
              (entry) => entry.id === targetEntryId,
            );
            if (targetIndex === -1) {
              return entries;
            }

            return [
              ...entriesWithoutPreview.slice(0, targetIndex),
              previewEntry,
              ...entriesWithoutPreview.slice(targetIndex),
            ];
          })();
  const previewIndex = reorderedEntries.findIndex(
    (entry) => entry.id === previewEntry.id,
  );
  const messagesAfterPreview = reorderedEntries
    .slice(previewIndex + 1)
    .filter((entry) => entry.kind === 'message').length;

  return Math.max(1, messagesAfterPreview);
}

function reorderEntriesForDragPreview(
  entries: VisibleTimelineEntry[],
  cutoffId: string | null,
  targetEntryId: string | null | undefined,
): VisibleTimelineEntry[] {
  if (!cutoffId) {
    return entries;
  }

  const draggedIndex = entries.findIndex((entry) => entry.id === cutoffId);
  if (draggedIndex === -1) {
    return entries;
  }

  const draggedEntry = entries[draggedIndex];
  if (
    draggedEntry?.kind !== 'history-cutoff' ||
    (draggedEntry.cutoff.source !== 'manual' &&
      draggedEntry.cutoff.source !== 'preview')
  ) {
    return entries;
  }

  const entriesWithoutDragged = entries.filter(
    (entry) => entry.id !== cutoffId,
  );
  if (targetEntryId === undefined) {
    return draggedEntry.cutoff.source === 'manual'
      ? entriesWithoutDragged
      : entries;
  }

  if (targetEntryId === null) {
    return [...entriesWithoutDragged, draggedEntry];
  }

  const targetIndex = entriesWithoutDragged.findIndex(
    (entry) => entry.id === targetEntryId,
  );
  if (targetIndex === -1) {
    return entries;
  }

  return [
    ...entriesWithoutDragged.slice(0, targetIndex),
    draggedEntry,
    ...entriesWithoutDragged.slice(targetIndex),
  ];
}

onBeforeUnmount(() => {
  stopManualCutoffDrag();
});
</script>

<style scoped>
@reference "../../styles.css";

.message-line {
  @apply block break-words text-[13px] leading-6 text-neutral-800;
}

.message-line-private {
  @apply block break-words text-[13px] leading-6 text-orange-700 italic;
}

.message-line-system {
  @apply block break-words text-[13px] leading-6 text-neutral-600;
}

.runtime-line {
  @apply block break-words text-[13px] leading-6;
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
  @apply whitespace-pre-wrap text-current;
}

.runtime-text {
  @apply whitespace-pre-wrap text-current;
}

.cutoff-stack {
  @apply grid gap-1;
}

.cutoff-banner {
  @apply relative isolate flex min-h-6 items-center overflow-hidden text-[13px] leading-6;
}

.cutoff-banner-preview {
  @apply w-full text-left text-red-800/65;
}

.cutoff-banner-manual {
  @apply w-full text-left text-amber-800/80;
}

.cutoff-banner-dragging {
  @apply cursor-grabbing;
}

.cutoff-banner-drop-target::after,
[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}

.cutoff-banner-preview::before {
  content: '';
  @apply absolute left-0 right-0 top-1/2 border-t border-dashed border-red-500/45;
}

.cutoff-title {
  @apply font-semibold text-current;
}

.cutoff-copy {
  @apply relative z-[1] shrink-0 bg-white px-0.5 pr-1;
}

.cutoff-manual-copy {
  @apply ml-0;
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

.cutoff-tail {
  @apply min-w-0 flex-1 border-t border-dashed border-amber-500/45;
}

.cutoff-tail-preview {
  @apply border-red-500/45;
}

.cutoff-link {
  @apply ml-2 cursor-pointer border-0 bg-transparent p-0 font-medium text-amber-900 underline decoration-amber-700/60 underline-offset-2;
}

.cutoff-link-secondary {
  @apply ml-0 text-neutral-600 decoration-neutral-500/60;
}

.cutoff-link-gap {
  @apply whitespace-pre;
}

.cutoff-link:hover {
  @apply text-amber-950 decoration-amber-900;
}

.cutoff-link-secondary:hover {
  @apply text-neutral-700 decoration-neutral-600;
}

:global(body.cutoff-drag-active) {
  user-select: none;
  cursor: grabbing;
}
</style>
