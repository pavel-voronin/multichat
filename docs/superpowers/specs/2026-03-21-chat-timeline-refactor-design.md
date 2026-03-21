# ChatTimeline Refactor Design

**Date:** 2026-03-21
**Scope:** Decompose `ChatTimeline.vue` into focused, self-contained components

---

## Problem

`ChatTimeline.vue` is 726 lines mixing three distinct rendering concerns (messages, technical events, cutoff banners), shared cost display, inspection logic, and a ~200-line drag-and-drop system. It is hard to read and hard to extend.

---

## Goal

Split the file into small, single-purpose components. Each component owns its rendering and behavior. No duplication. Styles are scoped to their component via `<style scoped>` with `@apply` Tailwind utilities — semantic class names in templates, no inline Tailwind, no global CSS.

---

## New File Structure

```
src/vue/
  composables/
    useCutoffDrag.ts          # new — singleton drag composable
  components/
    ChatTimeline.vue          # stays, shrinks to a thin coordinator
    timeline/
      MessageEntry.vue        # new
      TechnicalEventEntry.vue # new
      ManualCutoffBanner.vue  # new
      PreviewCutoffBanner.vue # new
      CostBadge.vue           # new
```

---

## Components

### `ChatTimeline.vue` (modified)

Becomes a thin coordinator: reads `visibleTimelineEntries`, calls `useCutoffDrag()` for drag state, computes `renderedTimelineEntries` via `reorderEntriesForDragPreview`, and delegates all rendering to child components.

**Wrapper div (new):** The bare `<template v-for>` gains a wrapper `<div>` with a semantic class (e.g. `timeline-root`). When drag is active (`isDragging`), an additional class `timeline-root--dragging` is applied, styled via `<style scoped>` as `@apply cursor-grabbing select-none`. The `v-for` lives inside this div. Check that the parent component (`ConversationPanel` or similar) is not broken by this new wrapper element.

**Test impact:** `history.test.ts` uses `.chat-log > *` selectors to assert entry ordering. With the new wrapper div, `.chat-log > *` matches only the `timeline-root` div instead of individual entries. Update these selectors to `[data-timeline-entry-id]` or `.timeline-root > *` as part of this task.

**Template:** A `v-for` loop inside the wrapper with three branches:
- `entry.kind === 'message'` → `<MessageEntry>`
- `entry.kind === 'technical-event'` → `<TechnicalEventEntry>`
- `entry.kind === 'history-cutoff'` → `<ManualCutoffBanner>` or `<PreviewCutoffBanner>` based on `entry.cutoff.source`

**Props passed down to entries:** `dragPreviewTargetId` (for drop-target highlight), `costDisplayMode` (from timeline preferences).

**Props passed to banners:** `draggedCutoffId`, `dragPreviewTargetId`.

**Stores accessed directly:** `useTimelineStore` only (for `visibleTimelineEntries` and `preferences`).

**Cleanup:** Calls `useCutoffDrag().stopDrag()` in `onBeforeUnmount` to reset singleton state and remove window listeners.

---

### `MessageEntry.vue` (new)

Renders one `<article>` for a message timeline entry.

**Props:** `entry` (message timeline entry), `dragPreviewTargetId: string | null | undefined`, `costDisplayMode`

**Required data attributes on root `<article>`:**
- `data-manual-cutoff-drop-target="true"` — marks this element as a valid drag drop target
- `:data-timeline-entry-id="entry.id"` — used by `resolveCutoffDropTarget` to identify the entry
- `:data-cutoff-drop-active="dragPreviewTargetId === entry.id"` — triggers drop-indicator styling

**Stores used directly:** `useInspectionStore`, `useMessageInputStore` (double-click mention), `useTimelineStore` (for `participantNameById` lookup via `state.participants`)

**Responsibilities:**
- Time button (clickable if inspectable → `openInspection`)
- Sender span (double-click to mention)
- `<CostBadge>` child component
- Message text
- `messageClasses` logic (system / private / muted)
- `participantNameById(id)` — reads from timeline store `state.participants`

**Styles:** message-line-*, message-time, message-sender, message-text, message-separator in `<style scoped>`.
The drop-indicator rule:
```css
[data-cutoff-drop-active='true']::before { @apply ...; }
```
lives in this component's `<style scoped>` (targets the component's own root element; Vue scoped attribute ensures it doesn't leak).

---

### `TechnicalEventEntry.vue` (new)

Renders one `<article>` for a technical event timeline entry.

**Props:** `entry` (event timeline entry), `dragPreviewTargetId: string | null | undefined`, `costDisplayMode`

**Required data attributes on root `<article>`:** same three as `MessageEntry` — `data-manual-cutoff-drop-target`, `data-timeline-entry-id`, `data-cutoff-drop-active`.

**Stores used directly:** `useInspectionStore`, `useTimelineStore` (for both `canInspectEvent` and `participantNameById` lookup)

**Responsibilities:**
- Time button (clickable if inspectable → `openEventInspection`)
- Runtime label (`formatTechnicalEventLabel(event, { byId: participantNameById })`)
- `<CostBadge>` child component
- Runtime text (`formatTechnicalEventText`)
- `technicalEventClasses` logic

**Styles:** runtime-line-*, runtime-label, runtime-text, message-separator in `<style scoped>`. Same `[data-cutoff-drop-active='true']::before` rule as `MessageEntry`.

---

### `CostBadge.vue` (new)

Shared component used by both `MessageEntry` and `TechnicalEventEntry`. Renders the cost span with hover trigger for the cost bubble.

**Props:**
- `item: CostTrackedItem` — the type defined in `src/vue/types.ts` (a `Pick` that both `ChatMessage` and `RuntimeEvent` satisfy)
- `itemId: string` — the `.id` of the message or event, passed separately because `CostTrackedItem` does not include `id`
- `costDisplayMode`

**Composables:** `useOverlayControls` for `openCostBubble(itemId, $event)` / `scheduleCostBubbleClose()`

Renders nothing (`v-if`) if `shouldShowMessageCost(item, costDisplayMode)` is false.

**Styles:** message-cost, message-cost-trigger, message-cost-request, message-cost-total, message-cost-net in `<style scoped>`.

---

### `ManualCutoffBanner.vue` (new)

Renders the amber manual cutoff banner with drag handle, "Context starts below" copy, delete and remove buttons.

**Props:** `entry` (manual cutoff timeline entry), `draggedCutoffId: string | null`, `dragPreviewTargetId: string | null | undefined`

**Required data attributes on root element:**
- `data-manual-cutoff-drop-target="true"`
- `:data-timeline-entry-id="entry.id"`
- `:data-cutoff-drop-active="dragPreviewTargetId === entry.id"`

**Stores used directly:** `useSessionStore` — two usages:
1. "Delete messages above" button → `session.clearHistoryBeforeAgentCutoff()`
2. "Remove cut-off" button → `session.removeManualCutoff()`
(The composable also calls `session.removeManualCutoff()` during drag completion when dropped outside the list — both usages are correct and independent.)

**Composables:** `useCutoffDrag()` — calls `startDrag(event, entry.id)` on `@pointerdown` of the drag handle.

**Styles:** cutoff-banner-manual, cutoff-controls, cutoff-drag-handle, cutoff-copy, cutoff-title, cutoff-link, cutoff-link-secondary, cutoff-link-gap, cutoff-tail, cutoff-banner-dragging, cutoff-banner-drop-target in `<style scoped>`. The `cutoff-banner-drop-target::after` rule also lives here.

---

### `PreviewCutoffBanner.vue` (new)

Renders the red dashed preview cutoff banner with drag handle and label.

**Props:** `entry` (preview cutoff timeline entry), `draggedCutoffId: string | null`, `dragPreviewTargetId: string | null | undefined`

**Required data attributes on root element:** same three as `ManualCutoffBanner`.

**Stores used directly:** none. All session mutations for preview cutoff drag are handled inside `useCutoffDrag`.

**Composables:** `useCutoffDrag()` — calls `startDrag(event, entry.id)` on `@pointerdown`.

**Styles:** cutoff-banner-preview, cutoff-drag-handle-preview, cutoff-tail-preview in `<style scoped>`. Shares `cutoff-banner-dragging` and `cutoff-banner-drop-target::after` patterns — duplicate in this component's scoped styles.

---

## `useCutoffDrag.ts` (new composable)

Singleton pattern: state refs declared at **module scope** (outside the composable function) so all callers share one instance.

**Consequence for tests:** State persists across mounts. `ChatTimeline.vue` calls `stopDrag()` in `onBeforeUnmount` to reset state. Tests that mount `ChatTimeline` will get a clean state after each unmount. If tests need isolation without mounting `ChatTimeline`, they can call `stopDrag()` directly in test teardown.

**Exported state (readonly):**
- `draggedCutoffId: Ref<string | null>`
- `dragPreviewTargetId: Ref<string | null | undefined>`
- `isDragging: ComputedRef<boolean>`

**Exported functions:**
- `startDrag(event: PointerEvent, cutoffId: string): void` — called by banners on pointerdown
- `stopDrag(): void` — resets all state, removes window listeners; called by ChatTimeline in `onBeforeUnmount`
- `reorderEntriesForDragPreview(entries: VisibleTimelineEntry[], cutoffId: string | null, targetId: string | null | undefined): VisibleTimelineEntry[]`

**`targetId` semantics** (non-obvious, used throughout):
- `undefined` — cursor is outside the chat log; drag is "cancelled" visually
- `null` — cursor is past the last entry; drop appends the cutoff at the end
- `string` — the `entry.id` of the entry the cutoff should be inserted before

**Internal logic:**
- `updateDrag`, `finishDrag`, `cancelDrag`, `stopDrag` — pointer event handlers attached/detached on window
- `resolveCutoffDropTarget(clientX, clientY, cutoffId): string | null | undefined` — DOM scan using `[data-manual-cutoff-drop-target]` and `[data-timeline-entry-id]`
- `resolveContextWindowSizeFromDropTarget(entries, targetId): number | null` — counts messages after the preview cutoff in the reordered list; returns `null` if no preview cutoff exists
- Calls `useSessionStore()` for `moveManualCutoffBefore`, `removeManualCutoff`, `updateContextWindowSize`
- Manages `activePointerId` internally
- On drag start: sets `document.body.style.userSelect = 'none'` and `document.body.style.cursor = 'grabbing'` directly via JS (prevents text selection across the whole page, including the composer). On `stopDrag`: resets both to `''`. No `body.cutoff-drag-active` class or `:global()` rule needed.

---

## Style Convention

- Template elements use **semantic class names** only (e.g. `class="message-line"`, `class="cutoff-banner"`)
- All styles in `<style scoped>` using `@apply` with Tailwind utility classes
- No inline Tailwind classes in templates
- No `:global()` selectors — the compound selector `[data-cutoff-drop-active='true']::before` is placed in the scoped styles of each entry/banner component (targets its own root element; Vue's scoped attribute makes it safe)
- Banner drop-target highlight is driven by the `cutoff-banner-drop-target` **CSS class** (`:class` binding, `::after` pseudo-element); entry drop-target highlight is driven by `data-cutoff-drop-active` **attribute selector** (`::before` pseudo-element). These are separate rules, each living in the respective component's `<style scoped>`.
- Each component is fully self-contained style-wise

---

## What Does Not Change

- `formatMessageTime`, `formatMessageAuthor`, `formatTechnicalEventLabel`, `formatTechnicalEventText`, `isSystemMessage`, `technicalEventClasses` — pure formatting functions, imported where needed
- `displayedMessageCost`, `formatMessageCost`, `messageCostSummaryClass`, `shouldShowMessageCost` — imported into `CostBadge.vue`
- All store and type definitions remain unchanged
