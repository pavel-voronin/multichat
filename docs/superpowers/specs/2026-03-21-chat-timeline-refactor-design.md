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

Template: a `v-for` loop with three branches — `MessageEntry`, `TechnicalEventEntry`, or a cutoff branch that picks `ManualCutoffBanner` / `PreviewCutoffBanner`.

Drag cursor: a wrapper div with a conditional semantic class (e.g. `timeline-root--dragging`) styled in `<style scoped>` as `@apply cursor-grabbing select-none` when drag is active.

Props passed down to entries: `dragPreviewTargetId` (for drop-target highlight), `costDisplayMode` (from timeline preferences). Props passed to banners: `draggedCutoffId`, `dragPreviewTargetId`.

No stores accessed directly beyond `useTimelineStore` for entries and preferences.

---

### `MessageEntry.vue` (new)

Renders one `<article>` for a message timeline entry.

**Props:** `entry` (message timeline entry), `dragPreviewTargetId`, `costDisplayMode`

**Stores used directly:** `useInspectionStore`, `useMessageInputStore` (double-click mention), `useOverlayControls`

**Responsibilities:**
- Time button (clickable if inspectable → `openInspection`)
- Sender span (double-click to mention)
- `CostBadge` child component
- Message text
- `messageClasses` logic (system / private / muted)
- `participantNameById` lookup via timeline store

**Styles:** all message-line-*, message-time, message-sender, message-text, message-separator styles live here in `<style scoped>`.

---

### `TechnicalEventEntry.vue` (new)

Renders one `<article>` for a technical event timeline entry.

**Props:** `entry` (event timeline entry), `dragPreviewTargetId`, `costDisplayMode`

**Stores used directly:** `useInspectionStore`, `useTimelineStore` (for `canInspectEvent`), `useOverlayControls`

**Responsibilities:**
- Time button (clickable if inspectable → `openEventInspection`)
- Runtime label (`formatTechnicalEventLabel`)
- `CostBadge` child component
- Runtime text (`formatTechnicalEventText`)
- `technicalEventClasses` logic

**Styles:** runtime-line-*, runtime-label, runtime-text, message-separator styles live here in `<style scoped>`.

---

### `CostBadge.vue` (new)

Shared component used by both `MessageEntry` and `TechnicalEventEntry`. Renders the cost span with hover trigger for the cost bubble.

**Props:** `item` (ChatMessage | RuntimeEvent), `costDisplayMode`

**Composables:** `useOverlayControls` for `openCostBubble` / `scheduleCostBubbleClose`

Renders nothing if `shouldShowMessageCost(item, costDisplayMode)` is false.

**Styles:** message-cost, message-cost-trigger, message-cost-request, message-cost-total, message-cost-net in `<style scoped>`.

---

### `ManualCutoffBanner.vue` (new)

Renders the amber manual cutoff banner with drag handle, "Context starts below" copy, delete and remove buttons.

**Props:** `entry` (manual cutoff timeline entry), `draggedCutoffId`, `dragPreviewTargetId`

**Stores used directly:** `useSessionStore` (delete messages above, remove cutoff)

**Composables:** `useCutoffDrag()` — calls `startDrag(event, entry.id)` on pointer down

**Styles:** all cutoff-banner-manual, cutoff-controls, cutoff-drag-handle, cutoff-copy, cutoff-title, cutoff-link styles in `<style scoped>`. The `:global(body.cutoff-drag-active)` rule is eliminated — cursor is handled at the ChatTimeline wrapper level.

---

### `PreviewCutoffBanner.vue` (new)

Renders the red dashed preview cutoff banner with drag handle and label.

**Props:** `entry` (preview cutoff timeline entry), `draggedCutoffId`, `dragPreviewTargetId`

**Composables:** `useCutoffDrag()` — calls `startDrag(event, entry.id)` on pointer down

**Styles:** cutoff-banner-preview, cutoff-tail-preview styles in `<style scoped>`.

---

## `useCutoffDrag.ts` (new composable)

Singleton pattern: state refs declared at module scope so all callers share one instance.

**Exported state (readonly):**
- `draggedCutoffId: Ref<string | null>`
- `dragPreviewTargetId: Ref<string | null | undefined>`
- `isDragging: ComputedRef<boolean>`

**Exported functions:**
- `startDrag(event: PointerEvent, cutoffId: string): void` — called by banners
- `reorderEntriesForDragPreview(entries, cutoffId, targetId): VisibleTimelineEntry[]` — called by ChatTimeline

**Internal logic:**
- `updateDrag`, `finishDrag`, `cancelDrag`, `stopDrag` — pointer event handlers attached/detached on window
- `resolveCutoffDropTarget(clientX, clientY, cutoffId)` — DOM scan for drop target
- `resolveContextWindowSizeFromDropTarget(entries, targetId)` — counts messages after preview cutoff
- Calls `useSessionStore()` for `moveManualCutoffBefore`, `removeManualCutoff`, `updateContextWindowSize`
- Manages `activePointerId` internally

---

## Style Convention

- Template elements use **semantic class names** only (e.g. `class="message-line"`, `class="cutoff-banner"`)
- All styles in `<style scoped>` using `@apply` with Tailwind utility classes
- No inline Tailwind classes in templates
- No global CSS, no `:global()` selectors
- Each component is fully self-contained style-wise

---

## What Does Not Change

- `formatMessageTime`, `formatMessageAuthor`, `formatTechnicalEventLabel`, `formatTechnicalEventText`, `isSystemMessage`, `technicalEventClasses` — pure formatting functions, imported where needed
- `displayedMessageCost`, `formatMessageCost`, `messageCostSummaryClass`, `shouldShowMessageCost` — imported into `CostBadge.vue`
- All store and type definitions remain unchanged
