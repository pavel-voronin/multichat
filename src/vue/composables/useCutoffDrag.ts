import { computed, readonly, ref } from 'vue';
import type { VisibleTimelineEntry, TimelinePreviewCutoffEntry } from '../types';
import { useSessionStore } from '../stores/session';
import { useTimelineStore } from '../stores/timeline';

// Module-level singleton state — shared across all callers
const draggedCutoffId = ref<string | null>(null);
const dragPreviewTargetId = ref<string | null | undefined>(undefined);
let activePointerId: number | null = null;

// Exported pure helpers (also used in tests)
export function reorderEntriesForDragPreview(
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
    (draggedEntry.cutoff.source !== 'manual' && draggedEntry.cutoff.source !== 'preview')
  ) {
    return entries;
  }

  const entriesWithoutDragged = entries.filter((entry) => entry.id !== cutoffId);

  if (targetEntryId === undefined) {
    return draggedEntry.cutoff.source === 'manual' ? entriesWithoutDragged : entries;
  }

  if (targetEntryId === null) {
    return [...entriesWithoutDragged, draggedEntry];
  }

  const targetIndex = entriesWithoutDragged.findIndex((entry) => entry.id === targetEntryId);
  if (targetIndex === -1) {
    return entries;
  }

  return [
    ...entriesWithoutDragged.slice(0, targetIndex),
    draggedEntry,
    ...entriesWithoutDragged.slice(targetIndex),
  ];
}

/**
 * Counts messages after the preview cutoff in the given entries array.
 * IMPORTANT: The caller must pass already-reordered entries (i.e. call
 * `reorderEntriesForDragPreview` first). This function does not reorder internally.
 */
export function resolveContextWindowSizeFromDropTarget(
  entries: VisibleTimelineEntry[],
): number | null {
  const previewEntry = entries.find(
    (entry): entry is TimelinePreviewCutoffEntry =>
      entry.kind === 'history-cutoff' && entry.cutoff.source === 'preview',
  );
  if (!previewEntry) {
    return null;
  }

  const previewIndex = entries.findIndex((entry) => entry.id === previewEntry.id);
  const messagesAfterPreview = entries
    .slice(previewIndex + 1)
    .filter((entry) => entry.kind === 'message').length;

  return Math.max(1, messagesAfterPreview);
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
    chatLog.querySelectorAll<HTMLElement>('[data-manual-cutoff-drop-target="true"]'),
  ).filter((element) => element.dataset.timelineEntryId !== cutoffId);

  for (const element of dropTargets) {
    const rect = element.getBoundingClientRect();
    if (clientY <= rect.top + rect.height / 2) {
      return element.dataset.timelineEntryId ?? null;
    }
  }

  return null;
}

function updateDrag(event: PointerEvent): void {
  if (!draggedCutoffId.value || activePointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const entries = useTimelineStore().visibleTimelineEntries;
  const draggedEntry = entries.find((entry) => entry.id === draggedCutoffId.value);
  if (draggedEntry?.kind !== 'history-cutoff') {
    return;
  }

  dragPreviewTargetId.value = resolveCutoffDropTarget(
    event.clientX,
    event.clientY,
    draggedCutoffId.value,
  );
}

function finishDrag(event: PointerEvent): void {
  if (!draggedCutoffId.value || activePointerId !== event.pointerId) {
    return;
  }

  const entries = useTimelineStore().visibleTimelineEntries;
  const draggedEntry = entries.find((entry) => entry.id === draggedCutoffId.value);
  if (draggedEntry?.kind !== 'history-cutoff') {
    stopDrag();
    return;
  }

  const targetEntryId = resolveCutoffDropTarget(
    event.clientX,
    event.clientY,
    draggedCutoffId.value,
  );

  const session = useSessionStore();

  if (draggedEntry.cutoff.source === 'manual') {
    if (targetEntryId === undefined) {
      session.removeManualCutoff();
    } else {
      session.moveManualCutoffBefore(targetEntryId);
    }
  } else {
    if (targetEntryId === undefined) {
      stopDrag();
      return;
    }

    const reorderedEntries = reorderEntriesForDragPreview(
      entries,
      draggedCutoffId.value,
      targetEntryId,
    );
    const nextContextWindowSize = resolveContextWindowSizeFromDropTarget(reorderedEntries);
    if (nextContextWindowSize !== null) {
      session.updateContextWindowSize(nextContextWindowSize);
    }
  }

  stopDrag();
}

function cancelDrag(): void {
  stopDrag();
}

export function stopDrag(): void {
  draggedCutoffId.value = null;
  activePointerId = null;
  dragPreviewTargetId.value = undefined;
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  window.removeEventListener('pointermove', updateDrag);
  window.removeEventListener('pointerup', finishDrag);
  window.removeEventListener('pointercancel', cancelDrag);
}

export function useCutoffDrag() {
  const isDragging = computed(() => draggedCutoffId.value !== null);

  function startDrag(event: PointerEvent, cutoffId: string): void {
    if (draggedCutoffId.value !== null) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    draggedCutoffId.value = cutoffId;
    activePointerId = event.pointerId;
    const handle = event.currentTarget as HTMLElement | null;
    dragPreviewTargetId.value = resolveCutoffDropTarget(event.clientX, event.clientY, cutoffId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    handle?.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', updateDrag);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', cancelDrag);
  }

  return {
    draggedCutoffId: readonly(draggedCutoffId),
    dragPreviewTargetId: readonly(dragPreviewTargetId),
    isDragging,
    startDrag,
    stopDrag,
    reorderEntriesForDragPreview,
  };
}
