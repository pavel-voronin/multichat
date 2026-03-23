# Inspector Improvements — Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

A set of focused improvements to `RequestInspectionModal.vue` and related components. No new architecture — changes are scoped to the inspector modal, the inspection store, `InspectorMessageLine`, `ModelCard`, and `ui.ts`.

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

- **Subject area (left):** time, author, cost (in emerald/green, same colour as in chat history), message content — truncated with `…` if it doesn't fit. Cost appears between author and message text, matching the chat timeline order (`[time] <author> $cost message…`).
- **Nav arrows (right):** move from left to right, placed before the close button.
- **Close button:** keep `ml-2` guard spacing to the left.
- **CSS:** The left subject element must use `min-w-0` (as a flex child) and `truncate` (`overflow-hidden whitespace-nowrap text-ellipsis`). The current `flex-wrap` on `.inspection-subject` must be removed — wrapping is incompatible with ellipsis truncation.

---

## 2. Tab bar

### Type update

`src/vue/stores/ui.ts` defines:

```ts
export type InspectionTab = 'agent' | 'request' | 'result';
```

Change to:

```ts
export type InspectionTab = 'participant' | 'input' | 'output' | 'used-in';
```

Update all references: `UiStateSnapshot`, `ChatScopedUiStateSnapshot`, `defaultUiState()` (default value `'participant'`), and `activeInspectionTab` ref initial value.

### Renaming

| Old ID | New ID | Old Label | New Label |
|--------|--------|-----------|-----------|
| `agent` | `participant` | Agent | Participant |
| `request` | `input` | Request | Input |
| `result` | `output` | Result | Output |
| *(new)* | `used-in` | — | Used In |

### Default tab on open

In `inspection.ts`, `openForMessage()` currently hardcodes `ui.activeInspectionTab = 'agent'`.

- For regular messages: default to `'participant'`
- For system messages: default to `'used-in'` (the only useful tab for system messages)

### Hover bug fix

Active tab uses `bg-neutral-900 text-white`. On hover, the shared `hover:bg-neutral-50` makes the text invisible.

Fix: add `hover:bg-neutral-800` to `.inspection-tab-active`.

---

## 3. Participant tab (was Agent)

### Model card

Replace the raw fields (Agent, Model, Provider, Context length) with the existing `ModelCard` component in read-only mode.

- Add a `readonly` boolean prop to `ModelCard.vue`. When `true`, hide the "Change" button. The `defineEmits<{ change: [] }>()` declaration can remain — it will never fire in read-only mode, which is harmless in Vue 3.
- Use `agent.modelSnapshot` (the snapshot frozen at trace time) for the `snapshot` prop, so the card reflects the model that was actually used in the request, not the current live configuration. When `agent.modelSnapshot` is absent, `ModelCard` falls back to live model data automatically — no extra handling needed.
- Show the agent name as a label above the card.

### System prompt

Show two distinct blocks, each stretching to fill available panel space:

1. **Agent Prompt** — `agent.systemPrompt`
2. **Full System Prompt** — extracted from `trace.payloads.requestInputJson`

Extracting the full system prompt requires a type guard since `requestInputJson` is typed as `unknown`:

```ts
const fullSystemPrompt = computed<string | null>(() => {
  const json = trace.value?.payloads.requestInputJson;
  if (!json || typeof json !== 'object') return null;
  const messages = (json as { messages?: Array<{ role: string; content: string }> }).messages;
  return messages?.find((m) => m.role === 'system')?.content ?? null;
});
```

Both blocks:
- `<pre>` scrollable, no `max-h` cap — fills the remaining panel height
- Clearly labeled: "Agent Prompt" / "Full System Prompt (sent)"
- If the value is absent (no trace, or JSON shape differs): show `"—"`

---

## 4. Input tab (was Request)

### InspectorMessageLine — plain text format

Replace the multi-span layout (which causes merge artefacts due to `whitespace-pre` separator spans) with a single computed string rendered as one `<span>` inside the clickable button:

```
[HH:MM:SS] <Author> message content
```

For private messages:
```
[HH:MM:SS] <Sender -> Recipient> message content
```

The existing `inspector-line-private` CSS class (italic orange styling, driven by `message.target === 'private'`) remains on the wrapping `<button>` — the refactor does not change how private styling is applied.

### Meta fields

Started, Duration, Input tokens — kept as-is.

---

## 5. Output tab (was Result)

### Two separate accordions

Replace the single "Raw JSON" accordion (three labelled sections) with two independent accordions:

1. **Request Input** — `trace.payloads.requestInputJson`, own Copy button
2. **Response Output** — `trace.payloads.responseOutputJson`, own Copy button

`normalizedActionJson` is removed entirely.

Each accordion body: JSON code block directly, no internal label headers, no extra padding wrapper.

### Meta fields

Action, Output tokens, Cost, Duration — kept as-is.

---

## 6. System messages

`canInspectMessage` currently returns `!isSystemMessage(message)`. Remove this restriction — all messages are inspectable.

For system messages, Participant / Input / Output tabs show their normal empty states (no trace). The "Used In" tab is the primary useful view for system messages, and is set as the default tab when opening them (see Section 2).

---

## 7. Used In tab (new)

Shows which agent requests included this message in their visible context.

### Data source

`diagnostics.value.messageInspectionIndex[messageId].downstreamTraceIds`

For each downstream trace ID:
- Resolve `diagnostics.value.requestTraces[traceId]`
- Get `trace.producedMessageId`
- Look up that message via `findMessageById`
- Render as an InspectorMessageLine (same plain-text format as Input tab)
- Clicking navigates via `inspection.navigateTo(producedMessageId)` — `navigateTo` does **not** reset the active tab; the user stays on the `used-in` tab after navigation, which is intentional

### Store addition

Add to `inspection.ts` store body and export in the `return {}` block:

```ts
const usedInMessagesForCurrentMessage = computed<ChatMessage[]>(() => {
  const messageId = currentInspectedMessage.value?.id;
  if (!messageId) return [];
  const index = diagnostics.value.messageInspectionIndex[messageId];
  if (!index) return [];
  return index.downstreamTraceIds
    .map((traceId) => diagnostics.value.requestTraces[traceId])
    .filter(Boolean)
    .map((trace) =>
      trace.producedMessageId
        ? findMessageById(state.value, trace.producedMessageId)
        : null,
    )
    .filter((m): m is ChatMessage => m !== null);
});
```

### Empty state

If no downstream messages: `"No messages used this in their context."`

---

## Affected files

| File | Change |
|------|--------|
| `src/vue/stores/ui.ts` | `InspectionTab` type updated to 4 new IDs; default value changed to `'participant'` |
| `src/vue/stores/inspection.ts` | `canInspectMessage` allows system messages; `openForMessage` default tab logic; add + export `usedInMessagesForCurrentMessage` |
| `src/vue/components/RequestInspectionModal.vue` | Header layout, tab names/IDs, tab content for all 4 tabs |
| `src/vue/components/timeline/InspectorMessageLine.vue` | Single computed string format |
| `src/vue/components/ModelCard.vue` | Add `readonly` prop |
| `src/vue/components/timeline/MessageEntry.vue` | No changes needed — inherits `canInspectMessage` fix from store |
