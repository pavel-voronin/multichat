# ChatMessageLine — unified chat line component

## Goal

Replace three separate implementations of the same visual chat line with one component used everywhere identically.

## Current problem

Three places render the same `[time] sender $cost text` line differently:

- `MessageEntry.vue` — timeline, uses `<button>` for time (inline-block, causes misalignment)
- `InspectorMessageLine.vue` — inspector context/Used In lists, renders as plain `<button>` with no sub-element interactivity
- `RequestInspectionModal.vue` header — manually reimplements the line with hand-rolled spans

This creates visual inconsistency, repeated logic, and whitespace bugs (elements joining without spaces).

## Solution

New `ChatMessageLine.vue` — one component, minimal props.

### Props

```ts
defineProps<{
  message: ChatMessage
  muted?: boolean
}>()
```

- `muted` — passed by `MessageEntry.vue` from `entry.isMuted`; controls the muted text color class. `ChatMessage` itself has no muted state; it is computed at the timeline layer.
- `costDisplayMode` — read from `usePreferencesStore()` internally; NOT a prop.
- participant names — read from `useTimelineStore().participantNameById` internally; NOT a prop. The timeline store is the single source of truth for participant names in both timeline and inspector contexts. Note: `InspectorMessageLine.vue` currently uses `inspectionStore.participantName` which returns `string` (not `string | null`); switching to `timelineStore.participantNameById` (returns `string | null`) is a type-correct improvement and matches the `ParticipantNameLookup` interface expected by `formatMessageAuthor`.

### Template structure

```html
<p class="chat-line" :class="lineClasses">
  <span
    class="time" :class="timeClasses"
    @click="handleInspect"
    @keydown.enter="handleInspect"
    @keydown.space.prevent="handleInspect"
  >[{{ time }}]</span>{{ ' '
  }}<span v-if="!isSystem" class="sender" @dblclick="handleMention">{{ sender }}</span
  ><CostBadge :item="message" :item-id="message.id" :cost-display-mode="costDisplayMode" />{{ ' '
  }}<span class="text">{{ message.content }}</span>
</p>
```

Spaces between elements: `{{ ' ' }}` text interpolations — not separator spans. Vue preserves expression interpolations, so no whitespace collapsing bugs.

**No space between `.sender` and `<CostBadge>`.** `CostBadge` emits its own leading `{{ ' ' }}` separator internally when visible. Adding one before it would produce a double space. The space after `<CostBadge>` (before text) is always emitted here because it is always needed — when cost is hidden, `CostBadge` renders nothing, so this space correctly separates sender from text.

`CostBadge` is unchanged — it still accepts `costDisplayMode` as a prop. `ChatMessageLine` reads the value from `usePreferencesStore()` and passes it down. `CostBadge` does not need to be refactored.

### Line variant classes

The component applies the correct class based on message type, mirroring the current behavior in both `MessageEntry.vue` and `InspectorMessageLine.vue`:

| Condition | Class |
|-----------|-------|
| `message.target === 'private'` | `chat-line-private` — italic, orange |
| `isSystemMessage(message)` | `chat-line-system` — gray |
| `muted === true` | `chat-line-muted` — lighter text, regardless of variant |
| default | `chat-line` — standard neutral-800 |

Private message styling is preserved in the inspector context/Used In lists through this same class logic — no special case needed.

### CSS and white-space

`white-space` is **not set** anywhere in the component — neither on root nor on any span. The parent context controls it via CSS inheritance:

- **Timeline**: `ChatTimeline.vue` message list container gets `whitespace-pre-wrap` → content inherits it → newlines and spaces preserved. `TechnicalEventEntry.vue` already sets `white-space: pre-wrap` on its own `.runtime-text` span explicitly, so it is unaffected by the container's value.
- **Inspector header**: `.inspection-subject` already has `whitespace-nowrap overflow-hidden` → inherited by the `<p>` root (no override in component) → inherited by all child spans → content renders as one line.
- **Inspector context/Used In list**: no explicit `white-space` on the container → browser default `normal` → words wrap, newlines collapsed. This matches the current `InspectorMessageLine.vue` behavior.

Truncation with ellipsis in the inspector header: external `truncate min-w-0` classes applied to the component root from outside:

```html
<ChatMessageLine :message="message" class="truncate min-w-0" />
```

`truncate` = `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. These are applied to the `<p>` element. Since the component does not set `white-space` internally, the `nowrap` value is inherited by all child spans, producing genuine single-line truncation with `...`.

`.inspection-subject` is a flex container; `ChatMessageLine`'s `<p>` becomes a flex item. `min-w-0` suppresses the default `min-width: auto` that would otherwise prevent the flex item from shrinking below its content width. Without `min-w-0`, truncation would not work in a flex layout.

### Time span: inline, not button

Time is rendered as `<span role="button" tabindex="0">` rather than `<button>`. Browsers render `<button>` as `display: inline-block` by default, which causes vertical alignment issues. An explicitly `display: inline` span behaves identically to surrounding text, eliminating the misalignment.

### Click-to-navigate in inspector lists

`InspectorMessageLine.vue` currently renders as a `<button>` so the entire line is clickable, navigating to that message in the inspector. After replacing it with `ChatMessageLine`, the whole-line click is handled by a wrapper in `RequestInspectionModal.vue`:

```html
<div
  v-for="msg in inspection.contextMessagesForCurrentTrace"
  :key="msg.id"
  class="inspector-line-wrapper"
  @click="inspection.navigateTo(msg.id)"
>
  <ChatMessageLine :message="msg" />
</div>
```

`.inspector-line-wrapper` provides the hover background and cursor styling that was previously on `.inspector-line`. This preserves the full-line click target without nesting interactive elements.

## Drag-drop: not this component's concern

`MessageEntry.vue` keeps its `<article>` wrapper with all drag-drop data attributes and `::before` drop indicator CSS. `ChatMessageLine` simply goes inside it.

```html
<!-- MessageEntry.vue -->
<article
  data-manual-cutoff-drop-target="true"
  :data-timeline-entry-id="entry.id"
  :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
>
  <ChatMessageLine :message="entry.message" :muted="entry.isMuted" />
</article>
```

The drag-drop system reads attributes from `<article>` and renders the drop indicator via `::before` on `<article>`. It is entirely unaffected by the change.

## What changes

| File | Change |
|------|--------|
| `ChatMessageLine.vue` | **New** — unified rendering component |
| `MessageEntry.vue` | Becomes thin wrapper: `<article>` + `<ChatMessageLine :message="entry.message" :muted="entry.isMuted" />` |
| `TechnicalEventEntry.vue` | Unchanged |
| `InspectorMessageLine.vue` | **Deleted** |
| `RequestInspectionModal.vue` | Inspector context/Used In: replace `<InspectorMessageLine>` with wrapper div + `<ChatMessageLine>`; header: replace manual spans with `<ChatMessageLine :message="message" class="truncate min-w-0">` |
| `ChatTimeline.vue` | Add `whitespace-pre-wrap` to message list container |

## Responsive reflow

Lines reflow on window resize because the component is `display: block` with inline content — standard browser flow. Container width determines where lines wrap. No fixed widths anywhere in the component.
