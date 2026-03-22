# ChatTimeline Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 726-line `ChatTimeline.vue` monolith into five focused sub-components and one composable, making the code readable and extensible.

**Architecture:** Extract message, technical event, and cutoff banner rendering into dedicated components under `components/timeline/`. Shared cost display becomes `CostBadge.vue`. Drag-and-drop logic becomes `useCutoffDrag.ts` — a module-level singleton composable. `ChatTimeline.vue` shrinks to a thin coordinator with a clean `v-for` template.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), Pinia, TypeScript, Tailwind CSS via `@apply` in `<style scoped>`, Vitest + Vue Test Utils

---

## File Map

**Create:**

- `src/vue/composables/useCutoffDrag.ts` — singleton drag composable
- `src/vue/components/timeline/CostBadge.vue` — cost display, shared by entries
- `src/vue/components/timeline/MessageEntry.vue` — renders one message article
- `src/vue/components/timeline/TechnicalEventEntry.vue` — renders one event article
- `src/vue/components/timeline/ManualCutoffBanner.vue` — amber cutoff banner
- `src/vue/components/timeline/PreviewCutoffBanner.vue` — red preview cutoff banner
- `tests/vue/composables/useCutoffDrag.test.ts` — unit tests for composable logic

**Modify:**

- `src/vue/components/ChatTimeline.vue` — rewrite as thin coordinator
- `tests/vue/components/multi-agent-chat/history.test.ts` — update `.chat-log > *` selectors

---

## Style Convention (applies to all tasks)

- Template elements: **semantic class names only** — e.g. `class="message-line"`, never `class="text-sm text-neutral-800"`
- All styles: `<style scoped>` with `@apply tailwind-utilities`
- No `:global()`, no inline Tailwind in templates
- Reference `../../styles.css` at top of every `<style scoped>` block: `@reference "../../styles.css";` (adjust relative depth as needed)

---

## Task 1: Create `useCutoffDrag.ts`

**Files:**

- Create: `src/vue/composables/useCutoffDrag.ts`
- Create: `tests/vue/composables/useCutoffDrag.test.ts`

This composable owns all drag state and logic. State refs live at module scope (singleton pattern) — all callers share one instance.

- [ ] **Step 1: Write failing tests for the pure helper functions**

Create `tests/vue/composables/useCutoffDrag.test.ts`:

```typescript
import { afterEach, describe, expect, it } from 'vitest';
import {
  reorderEntriesForDragPreview,
  resolveContextWindowSizeFromDropTarget,
  stopDrag,
} from '../../../src/vue/composables/useCutoffDrag';
import type { VisibleTimelineEntry } from '../../../src/vue/types';

// Reset singleton state after every test — required for any test that calls startDrag()
afterEach(() => {
  stopDrag();
});

function makeMessage(id: string): VisibleTimelineEntry {
  return {
    kind: 'message',
    id,
    sortAt: 0,
    isMuted: false,
  } as VisibleTimelineEntry;
}

function makeManualCutoff(id: string): VisibleTimelineEntry {
  return {
    kind: 'history-cutoff',
    id,
    sortAt: 0,
    cutoff: { source: 'manual' },
  } as VisibleTimelineEntry;
}

function makePreviewCutoff(id: string): VisibleTimelineEntry {
  return {
    kind: 'history-cutoff',
    id,
    sortAt: 0,
    cutoff: {
      source: 'preview',
      label: 'preview',
      anchor: { kind: 'end' },
      agentIds: [],
      agentNames: [],
    },
  } as VisibleTimelineEntry;
}

describe('reorderEntriesForDragPreview', () => {
  it('returns entries unchanged when cutoffId is null (no drag active)', () => {
    const entries = [
      makeMessage('m1'),
      makeManualCutoff('c1'),
      makeMessage('m2'),
    ];
    expect(reorderEntriesForDragPreview(entries, null, undefined)).toEqual(
      entries,
    );
  });

  it('hides the manual cutoff from the list when targetId is undefined (dragged outside)', () => {
    const m1 = makeMessage('m1');
    const c1 = makeManualCutoff('c1');
    const m2 = makeMessage('m2');
    const result = reorderEntriesForDragPreview([m1, c1, m2], 'c1', undefined);
    expect(result).toEqual([m1, m2]);
  });

  it('appends cutoff at end when targetId is null (dragged past last entry)', () => {
    const m1 = makeMessage('m1');
    const c1 = makeManualCutoff('c1');
    const m2 = makeMessage('m2');
    const result = reorderEntriesForDragPreview([m1, c1, m2], 'c1', null);
    expect(result).toEqual([m1, m2, c1]);
  });

  it('inserts cutoff before the target entry', () => {
    const m1 = makeMessage('m1');
    const c1 = makeManualCutoff('c1');
    const m2 = makeMessage('m2');
    const m3 = makeMessage('m3');
    const result = reorderEntriesForDragPreview([m1, c1, m2, m3], 'c1', 'm3');
    expect(result).toEqual([m1, m2, c1, m3]);
  });
});

describe('resolveContextWindowSizeFromDropTarget', () => {
  it('returns null when there is no preview cutoff in entries', () => {
    const entries = [makeMessage('m1'), makeManualCutoff('c1')];
    expect(resolveContextWindowSizeFromDropTarget(entries, 'm1')).toBeNull();
  });

  it('counts messages after the preview cutoff', () => {
    const entries = [
      makeMessage('m1'),
      makePreviewCutoff('p1'),
      makeMessage('m2'),
      makeMessage('m3'),
    ];
    // targetId doesn't matter here — entries already contain preview in the right position
    expect(resolveContextWindowSizeFromDropTarget(entries, null)).toBe(2);
  });

  it('returns 1 (minimum) when no messages come after the preview cutoff', () => {
    const entries = [
      makeMessage('m1'),
      makeMessage('m2'),
      makePreviewCutoff('p1'),
    ];
    expect(resolveContextWindowSizeFromDropTarget(entries, null)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/vue/composables/useCutoffDrag.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `src/vue/composables/useCutoffDrag.ts`**

```typescript
import { computed, readonly, ref } from 'vue';
import type {
  VisibleTimelineEntry,
  TimelinePreviewCutoffEntry,
} from '../types';
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

/**
 * Counts messages after the preview cutoff in the given entries array.
 * IMPORTANT: The caller must pass already-reordered entries (i.e. call
 * `reorderEntriesForDragPreview` first). This function does not reorder internally.
 */
export function resolveContextWindowSizeFromDropTarget(
  entries: VisibleTimelineEntry[],
  _targetEntryId: string | null | undefined,
): number | null {
  const previewEntry = entries.find(
    (entry): entry is TimelinePreviewCutoffEntry =>
      entry.kind === 'history-cutoff' && entry.cutoff.source === 'preview',
  );
  if (!previewEntry) {
    return null;
  }

  const previewIndex = entries.findIndex(
    (entry) => entry.id === previewEntry.id,
  );
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

function updateDrag(event: PointerEvent): void {
  if (!draggedCutoffId.value || activePointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const entries = useTimelineStore().visibleTimelineEntries;
  const draggedEntry = entries.find(
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

function finishDrag(event: PointerEvent): void {
  if (!draggedCutoffId.value || activePointerId !== event.pointerId) {
    return;
  }

  const entries = useTimelineStore().visibleTimelineEntries;
  const draggedEntry = entries.find(
    (entry) => entry.id === draggedCutoffId.value,
  );
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
    const nextContextWindowSize = resolveContextWindowSizeFromDropTarget(
      reorderedEntries,
      targetEntryId,
    );
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
```

- [ ] **Step 4: Run unit tests to verify they pass**

```bash
npx vitest run tests/vue/composables/useCutoffDrag.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/vue/composables/useCutoffDrag.ts tests/vue/composables/useCutoffDrag.test.ts
git commit -m "feat: extract useCutoffDrag composable from ChatTimeline"
```

---

## Task 2: Create `CostBadge.vue`

**Files:**

- Create: `src/vue/components/timeline/CostBadge.vue`

Shared cost display used by both message and event entries. Renders nothing when cost is zero or mode is off.

- [ ] **Step 1: Create `src/vue/components/timeline/CostBadge.vue`**

```vue
<template>
  <template v-if="shouldShow">
    <span class="message-separator">{{ ' ' }}</span>
    <span class="message-cost">
      <span
        class="message-cost-trigger"
        :class="costClass"
        @mouseenter="overlayControls.openCostBubble(itemId, $event)"
        @mouseleave="overlayControls.scheduleCostBubbleClose()"
        >{{ formattedCost }}</span
      >
    </span>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CostDisplayMode, CostTrackedItem } from '../../types';
import { useOverlayControls } from '../../useOverlayControls';
import {
  displayedMessageCost,
  formatMessageCost,
  messageCostSummaryClass,
  shouldShowMessageCost,
} from '../../utils/costing';

const props = defineProps<{
  item: CostTrackedItem;
  itemId: string;
  costDisplayMode: CostDisplayMode;
}>();

const overlayControls = useOverlayControls();

const shouldShow = computed(() =>
  shouldShowMessageCost(props.item, props.costDisplayMode),
);
const cost = computed(() =>
  displayedMessageCost(props.item, props.costDisplayMode),
);
const formattedCost = computed(() => formatMessageCost(cost.value));
const costClass = computed(() =>
  messageCostSummaryClass(props.item, props.costDisplayMode),
);
</script>

<style scoped>
@reference "../../../styles.css";

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
</style>
```

- [ ] **Step 2: Run the full test suite to confirm nothing is broken yet**

```bash
npx vitest run
```

Expected: same results as before this task (no regressions — `CostBadge` is unused so far)

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/timeline/CostBadge.vue
git commit -m "feat: add CostBadge component"
```

---

## Task 3: Create `MessageEntry.vue`

**Files:**

- Create: `src/vue/components/timeline/MessageEntry.vue`

Renders one `<article>` for a message timeline entry. Owns its inspection, mention, cost display, and formatting logic.

**Important data attributes** (required for drag-and-drop to work):

- `data-manual-cutoff-drop-target="true"` — marks this as a valid drop target
- `:data-timeline-entry-id="entry.id"` — used by `resolveCutoffDropTarget` DOM scan
- `:data-cutoff-drop-active="dragPreviewTargetId === entry.id"` — triggers the amber drop indicator line via `::before` pseudo-element in scoped CSS

- [ ] **Step 1: Create `src/vue/components/timeline/MessageEntry.vue`**

```vue
<template>
  <article
    :class="entryClasses"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <button
      type="button"
      class="message-time message-time-trigger"
      :class="{ 'message-time-trigger-active': canInspect }"
      :disabled="!canInspect"
      @click="handleInspect"
    >
      [{{ formatMessageTime(entry.message.createdAt) }}]</button
    ><template v-if="!isSystem">
      <span class="message-separator">{{ ' ' }}</span
      ><span
        class="message-sender"
        @dblclick="messageInput.mentionMessageSender(entry.message)"
        >{{ authorLabel }}</span
      > </template
    ><CostBadge
      :item="entry.message"
      :item-id="entry.message.id"
      :cost-display-mode="costDisplayMode"
    /><span class="message-separator">{{ ' ' }}</span
    ><span class="message-text">{{ entry.message.content }}</span>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getMessageSenderId } from '../../../core';
import type { CostDisplayMode, VisibleTimelineMessageEntry } from '../../types';
import { useInspectionStore } from '../../stores/inspection';
import { useMessageInputStore } from '../../stores/messageInput';
import { useTimelineStore } from '../../stores/timeline';
import {
  formatMessageAuthor,
  formatMessageTime,
  isSystemMessage,
} from '../../utils/chatFormatting';
import CostBadge from './CostBadge.vue';

const props = defineProps<{
  entry: VisibleTimelineMessageEntry;
  dragPreviewTargetId: string | null | undefined;
  costDisplayMode: CostDisplayMode;
}>();

const inspection = useInspectionStore();
const messageInput = useMessageInputStore();
const timeline = useTimelineStore();

const isSystem = computed(() => isSystemMessage(props.entry.message));

const authorLabel = computed(() =>
  formatMessageAuthor(props.entry.message, {
    byId: timeline.participantNameById,
  }),
);

const canInspect = computed(() =>
  inspection.canInspectMessage(props.entry.message),
);

const entryClasses = computed(() => {
  const base = isSystem.value
    ? 'message-line-system'
    : props.entry.message.target === 'private'
      ? 'message-line-private'
      : 'message-line';
  return props.entry.isMuted ? `${base} message-line-muted` : base;
});

function handleInspect() {
  if (!canInspect.value) return;

  if (getMessageSenderId(props.entry.message) === 'human') {
    const subject = inspection.getInspectionSubjectForMessage(
      props.entry.message.id,
    );
    if (subject.downstreamTraces.length === 1) {
      inspection.openForTrace(
        subject.downstreamTraces[0]!.id,
        props.entry.message.id,
      );
      return;
    }
    inspection.openForMessage(props.entry.message.id);
    return;
  }

  if (props.entry.message.sourceTraceId) {
    inspection.openForTrace(
      props.entry.message.sourceTraceId,
      props.entry.message.id,
    );
  }
}
</script>

<style scoped>
@reference "../../../styles.css";

.message-line {
  @apply block break-words text-[13px] leading-6 text-neutral-800;
}

.message-line-private {
  @apply block break-words text-[13px] leading-6 text-orange-700 italic;
}

.message-line-system {
  @apply block break-words text-[13px] leading-6 text-neutral-600;
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

.message-separator {
  @apply whitespace-pre;
}

.message-text {
  @apply whitespace-pre-wrap text-current;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
```

Note: the `[data-cutoff-drop-active='true']::before` rule uses `position: absolute` implicitly — the `<article>` element does not currently have `position: relative`. Check if the line renders correctly in the browser. If the indicator line is misplaced, add `@apply relative` to `.message-line` (and variants).

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: same as before (component is unused so far)

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/timeline/MessageEntry.vue
git commit -m "feat: add MessageEntry component"
```

---

## Task 4: Create `TechnicalEventEntry.vue`

**Files:**

- Create: `src/vue/components/timeline/TechnicalEventEntry.vue`

Renders one `<article>` for a technical event (silent decision or runtime error).

- [ ] **Step 1: Create `src/vue/components/timeline/TechnicalEventEntry.vue`**

```vue
<template>
  <article
    :class="entryClasses"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <button
      type="button"
      class="message-time message-time-trigger"
      :class="{ 'message-time-trigger-active': canInspect }"
      :disabled="!canInspect"
      @click="handleInspect"
    >
      [{{ formatMessageTime(entry.event.createdAt) }}]</button
    ><span class="message-separator">{{ ' ' }}</span
    ><span class="runtime-label">{{ eventLabel }}</span
    ><CostBadge
      :item="entry.event"
      :item-id="entry.event.id"
      :cost-display-mode="costDisplayMode"
    /><span class="message-separator">{{ ' ' }}</span
    ><span class="runtime-text">{{ eventText }}</span>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  CostDisplayMode,
  VisibleTimelineTechnicalEventEntry,
} from '../../types';
import { useInspectionStore } from '../../stores/inspection';
import { useTimelineStore } from '../../stores/timeline';
import {
  formatMessageTime,
  formatTechnicalEventLabel,
  formatTechnicalEventText,
  technicalEventClasses,
} from '../../utils/chatFormatting';
import CostBadge from './CostBadge.vue';

const props = defineProps<{
  entry: VisibleTimelineTechnicalEventEntry;
  dragPreviewTargetId: string | null | undefined;
  costDisplayMode: CostDisplayMode;
}>();

const inspection = useInspectionStore();
const timeline = useTimelineStore();

const canInspect = computed(() => timeline.canInspectEvent(props.entry.event));

const entryClasses = computed(() => technicalEventClasses(props.entry.event));

const eventLabel = computed(() =>
  formatTechnicalEventLabel(props.entry.event, {
    byId: timeline.participantNameById,
  }),
);

const eventText = computed(() => formatTechnicalEventText(props.entry.event));

function handleInspect() {
  if (!props.entry.event.sourceTraceId) return;
  inspection.openForTrace(props.entry.event.sourceTraceId);
}
</script>

<style scoped>
@reference "../../../styles.css";

.runtime-line {
  @apply block break-words text-[13px] leading-6;
}

.runtime-line-silent {
  @apply text-sky-800;
}

.runtime-line-error {
  @apply text-red-800;
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

.runtime-label {
  @apply font-semibold text-sky-900;
}

.runtime-line-error .runtime-label {
  @apply text-red-900;
}

.message-separator {
  @apply whitespace-pre;
}

.runtime-text {
  @apply whitespace-pre-wrap text-current;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all pass (still unused)

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/timeline/TechnicalEventEntry.vue
git commit -m "feat: add TechnicalEventEntry component"
```

---

## Task 5: Create `ManualCutoffBanner.vue`

**Files:**

- Create: `src/vue/components/timeline/ManualCutoffBanner.vue`

Renders the amber "Context starts below" banner with drag handle and action links. Owns drag initiation via `useCutoffDrag`.

- [ ] **Step 1: Create `src/vue/components/timeline/ManualCutoffBanner.vue`**

```vue
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
        aria-label="Drag context cut-off"
        @pointerdown="drag.startDrag($event, entry.id)"
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

[data-cutoff-drop-active='true']::before {
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

.cutoff-manual-copy {
  @apply ml-0;
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
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/timeline/ManualCutoffBanner.vue
git commit -m "feat: add ManualCutoffBanner component"
```

---

## Task 6: Create `PreviewCutoffBanner.vue`

**Files:**

- Create: `src/vue/components/timeline/PreviewCutoffBanner.vue`

Renders the red dashed preview cutoff banner with drag handle and label. No direct store access — all mutations on drag completion are handled inside `useCutoffDrag`.

- [ ] **Step 1: Create `src/vue/components/timeline/PreviewCutoffBanner.vue`**

```vue
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

[data-cutoff-drop-active='true']::before {
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
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/timeline/PreviewCutoffBanner.vue
git commit -m "feat: add PreviewCutoffBanner component"
```

---

## Task 7: Rewrite `ChatTimeline.vue` and fix tests

**Files:**

- Modify: `src/vue/components/ChatTimeline.vue` — rewrite as thin coordinator
- Modify: `tests/vue/components/multi-agent-chat/history.test.ts` — update `.chat-log > *` selectors

This is the main switch. All the new components are wired in here. The monolith is replaced.

- [ ] **Step 1: Rewrite `src/vue/components/ChatTimeline.vue`**

Replace the entire file with:

```vue
<template>
  <div
    class="timeline-root"
    :class="{ 'timeline-root--dragging': drag.isDragging }"
  >
    <template v-for="entry in renderedTimelineEntries" :key="entry.id">
      <MessageEntry
        v-if="entry.kind === 'message'"
        :entry="entry"
        :drag-preview-target-id="drag.dragPreviewTargetId"
        :cost-display-mode="preferences.costDisplayMode"
      />
      <TechnicalEventEntry
        v-else-if="entry.kind === 'technical-event'"
        :entry="entry"
        :drag-preview-target-id="drag.dragPreviewTargetId"
        :cost-display-mode="preferences.costDisplayMode"
      />
      <ManualCutoffBanner
        v-else-if="
          entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual'
        "
        :entry="entry"
        :dragged-cutoff-id="drag.draggedCutoffId"
        :drag-preview-target-id="drag.dragPreviewTargetId"
      />
      <PreviewCutoffBanner
        v-else-if="
          entry.kind === 'history-cutoff' && entry.cutoff.source === 'preview'
        "
        :entry="entry"
        :dragged-cutoff-id="drag.draggedCutoffId"
        :drag-preview-target-id="drag.dragPreviewTargetId"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useCutoffDrag } from '../composables/useCutoffDrag';
import { useTimelineStore } from '../stores/timeline';
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
```

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: most tests pass, but `history.test.ts` fails on `.chat-log > *` selectors (5 occurrences)

- [ ] **Step 3: Fix `.chat-log > *` selectors in `history.test.ts`**

Open `tests/vue/components/multi-agent-chat/history.test.ts`. Find all 5 occurrences of `.findAll('.chat-log > *')` (at lines 47, 162, 361, 419, 434) and replace each with `.findAll('[data-timeline-entry-id]')`.

The pattern to replace in every occurrence:

```typescript
// Before:
.findAll('.chat-log > *')
// After:
.findAll('[data-timeline-entry-id]')
```

- [ ] **Step 4: Run the full test suite again**

```bash
npx vitest run
```

Expected: all tests PASS. If any fail, read the error carefully — it likely points to a missing import, wrong prop name, or a class that was not moved to the right component.

- [ ] **Step 5: Run typecheck**

```bash
npx vue-tsc --noEmit
```

Expected: no type errors. Fix any that appear before committing.

- [ ] **Step 6: Commit everything**

```bash
git add src/vue/components/ChatTimeline.vue tests/vue/components/multi-agent-chat/history.test.ts
git commit -m "refactor: decompose ChatTimeline into focused sub-components"
```

---

## Done

After Task 7 is complete and all tests pass:

- `ChatTimeline.vue` is ~40 lines
- Each concern lives in its own focused file under `components/timeline/`
- `useCutoffDrag.ts` owns all drag state and logic, testable independently
- No global CSS, no inline Tailwind, no `:global()` selectors
- All existing tests pass
