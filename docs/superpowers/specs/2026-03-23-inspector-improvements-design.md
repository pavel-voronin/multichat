# Inspector Improvements — Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

A set of focused improvements to `RequestInspectionModal.vue` and related components. No new architecture — changes are scoped to the inspector modal, the inspection store, and `InspectorMessageLine`.

---

## 1. Header

### Layout change

Current layout (left-to-right):
```
[nav ← →] [subject: time · author · action] [cost] [✕]
```

New layout:
```
[LEFT: time · author · $cost · message text truncated…] [RIGHT: ← → · ✕]
```

### Details

- **Subject area (left):** time, author, cost (in emerald/green, same colour as in chat), message content — truncated with `…` if it doesn't fit. Cost appears between author and message text, matching chat history order.
- **Nav arrows (right):** move from left to right, placed before the close button. Hidden / disabled when history has only one entry.
- **Close button:** keep `ml-2` guard spacing to the left.
- The header mirrors the chat line format: `[time] <author> $cost message…`

---

## 2. Tab bar

### Renaming

| Old | New |
|-----|-----|
| Agent | Participant |
| Request | Input |
| Result | Output |
| *(new)* | Used In |

### Hover bug fix

Active tab currently uses `bg-neutral-900 text-white`. On hover the button's default `hover:bg-neutral-50` bleeds through, making white text invisible against a near-white background.

Fix: add `hover:bg-neutral-800` to `.inspection-tab-active` to keep text visible.

---

## 3. Participant tab (was Agent)

### Model card

Replace the raw fields (Agent, Model, Provider, Context length) with the existing `ModelCard` component in read-only mode.

- Add a `readonly` boolean prop to `ModelCard.vue`. When `true`, the "Change" button is hidden.
- Pass `modelId` and `snapshot` from the current agent/trace.
- Show agent name as a label above the card.

### System prompt

Show two distinct blocks, each stretching to fill available panel space:

1. **Agent Prompt** — `agent.systemPrompt` (the persona prompt set in agent settings)
2. **Full System Prompt** — `messages[0].content` extracted from `trace.payloads.requestInputJson` (the full prompt actually sent to the API, which wraps the agent prompt with orchestration instructions)

Both blocks:
- `<pre>` scrollable, no `max-h` cap — fills the panel
- Clearly labeled so the user can tell which is which
- If trace is absent (e.g. system message), show "—" for both

---

## 4. Input tab (was Request)

### InspectorMessageLine — plain text format

Replace the multi-span layout with a single computed string:

```
[HH:MM:SS] <Author> message content
```

For private messages:
```
[HH:MM:SS] <Sender -> Recipient> message content
```

Rendered as a single `<span>` inside the clickable button. Eliminates the separator-span approach that was causing visible merge artefacts.

### Meta fields

Started, Duration, Input tokens — kept as-is.

---

## 5. Output tab (was Result)

### Two separate accordions

Replace the single "Raw JSON" accordion (with three labelled sections) with two independent accordions:

1. **Request Input** — `trace.payloads.requestInputJson`
   - Own Copy button that copies only this JSON
2. **Response Output** — `trace.payloads.responseOutputJson`
   - Own Copy button that copies only this JSON

`normalizedActionJson` is removed entirely.

Each accordion body: JSON code block directly, no internal label headers.

### Meta fields

Action, Output tokens, Cost, Duration — kept as-is.

---

## 6. System messages

`canInspectMessage` currently returns `!isSystemMessage(message)`. Remove this restriction — system messages are inspectable.

For system messages, Participant / Input / Output tabs will show their normal empty states (no trace). The "Used In" tab is the primary useful view for system messages.

---

## 7. Used In tab (new)

Shows which agent requests included this message in their visible context.

### Data source

`diagnostics.messageInspectionIndex[messageId].downstreamTraceIds`

Each entry in `downstreamTraceIds` is a trace ID. For each trace:
- Find `trace.producedMessageId`
- Look up that message
- Render as a plain-text InspectorMessageLine (same format as Input tab)
- Clicking navigates to that message's inspection via `inspection.navigateTo(producedMessageId)`

### Store addition

Add computed `usedInMessagesForCurrentMessage` to the inspection store:

```ts
const usedInMessagesForCurrentMessage = computed<ChatMessage[]>(() => {
  const messageId = currentInspectedMessage.value?.id;
  if (!messageId) return [];
  const index = diagnostics.value.messageInspectionIndex[messageId];
  if (!index) return [];
  return index.downstreamTraceIds
    .map((traceId) => diagnostics.value.requestTraces[traceId])
    .filter(Boolean)
    .map((trace) => trace.producedMessageId
      ? findMessageById(state.value, trace.producedMessageId)
      : null)
    .filter((m): m is ChatMessage => m !== null);
});
```

### Empty state

If no downstream messages: `"No messages used this in their context."`

---

## Affected files

| File | Change |
|------|--------|
| `src/vue/components/RequestInspectionModal.vue` | Header layout, tab names, tab content, Used In tab |
| `src/vue/components/timeline/InspectorMessageLine.vue` | Plain-text format |
| `src/vue/components/ModelCard.vue` | Add `readonly` prop |
| `src/vue/stores/inspection.ts` | `canInspectMessage`, `usedInMessagesForCurrentMessage` |
| `src/vue/components/timeline/MessageEntry.vue` | Allow system message inspection |
