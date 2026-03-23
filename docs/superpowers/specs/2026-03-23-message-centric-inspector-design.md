# Message-Centric Inspector Redesign

**Date:** 2026-03-23
**Status:** Approved

## Problem

The current inspector has two competing modes — "message" and "trace" — that expose internal implementation concepts to the user. The left navigation rail, six tabs, and separate `openForTrace` / `openForMessage` entry points make it impossible to understand at a glance why a message exists or what the agent was thinking when it wrote it.

## Goal

Open the inspector on a message and immediately understand: who wrote it, what model and prompt they used, what context they saw, and what came out of the request. No internal jargon, no duplicate views, no separate trace navigation.

## Design

### Entry point

The inspector is always opened **on a message**. There is no separate "trace view". The `RequestTrace` that produced a message is always displayed inside that message's inspector — never as a standalone subject.

Human messages open the same inspector. Agent/Request/Result tabs are shown but marked "no data" when no trace exists.

### Header (always visible, not scrollable)

| Element        | Content                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back / Forward | `←` `→` buttons, browser-style history stack                                                                                                                                                         |
| Subject        | Author name · timestamp · action type (`speak_public` / `send_private` / `stay_silent`). For human messages or when no trace exists, the action type slot is omitted (just author name · timestamp). |
| Cost           | Request cost in USD (`trace.usage.requestCostUsd`), omitted if no trace                                                                                                                              |
| Close          | `✕`                                                                                                                                                                                                  |

### Tab: Agent

Answers: _who wrote this, with what setup?_

- **Agent card**: name, model ID (`agentConfig.modelId`), provider (`trace.transport.provider`), context length (`agentConfig.modelSnapshot.contextLength`)
- **System prompt**: full text in a scrollable monospace area (`agentConfig.systemPrompt`)

For human messages and any case where `agentForCurrentMessage` is null: name shown as "Human" (or agent name if known), model and system prompt fields displayed as "—".

### Tab: Request

Answers: _what did the model see going in?_

- **Context messages**: the list of `visibleMessageIds` from the `RequestTrace`, resolved to `ChatMessage[]` from `runtimeStore.state.timeline`, rendered using the new `InspectorMessageLine` component (see below), in chronological order. Each message is clickable — clicking calls `navigateTo(message.id)`.
- **Request meta**: started-at timestamp (`trace.startedAt`), duration in seconds (`trace.finishedAt - trace.startedAt`), input token count (`trace.usage.promptTokens`).

For human messages or when no trace exists: section shows "no request data".

**Note:** only `visibleMessageIds` are shown. `triggeringMessageIds`, `downstreamMessageIds`, and `upstreamMessageIds` are intentionally not surfaced in this tab — the goal is to show what the agent saw, not the full causal graph.

### Tab: Result

Answers: _what decision did the model make?_

- **Action**: cast `trace.payloads.normalizedActionJson` to `AgentToolCall` (from `src/core/types.ts`), then render by type:
  - `speak_public` — "published to public chat"
  - `send_private` — "sent privately to `<participantName(action.to)>`" (resolve display name via inspection store's `participantName` utility; `action.to` is a participant ID)
  - `stay_silent` — "stayed silent: `<action.reason>`"
- **Metrics**: output tokens (`trace.usage.completionTokens`), total cost (`trace.usage.requestCostUsd`), duration in seconds
- **Raw JSON accordion** (collapsed by default, at the bottom):
  - Accordion trigger label: "Raw JSON"
  - "Copy" button in accordion header copies all three payloads as a single JSON object: `{ request, response, normalized }`
  - Three labeled sections inside: **Request input** (`requestInputJson`), **Response output** (`responseOutputJson`), **Normalized action** (`normalizedActionJson`)

For human messages or when no trace exists: section shows "no request data".

### Navigation history

The inspector maintains a history stack of message IDs. The inspection store owns the stack and exposes navigation methods. The UI store's `selectedMessageId` is removed — the current message is always `inspectionHistory[inspectionHistoryIndex]`.

- `navigateTo(messageId)`: truncates any forward history, pushes `messageId`, increments index. If the inspector is closed, opens it.
- `navigateBack()`: decrements index if > 0.
- `navigateForward()`: increments index if < stack length − 1.
- `openForMessage(messageId)`: resets the stack to `[messageId]`, sets index to 0, sets `showRequestInspection = true`.
- Stack resets whenever the inspector is opened fresh from the chat timeline.
- On chat tab switch, `inspectionHistory` and `inspectionHistoryIndex` must also be reset. Since `resetChatScopedState()` lives in the UI store and the history lives in the inspection store (creating a circular-dependency risk if ui calls inspection), the cleanest solution is: add a `reset()` method to the inspection store, and call it from `ChatTabs.vue` at the same three call sites where `ui.resetChatScopedState()` is called today.

Back button is disabled when index === 0. Forward button is disabled when index === stack length − 1.

## New component: InspectorMessageLine

A lightweight component for rendering a `ChatMessage` inside the inspector context list.

**Props:** `message: ChatMessage`
**Visual style:** identical to `MessageEntry` — same font, same timestamp/author/content layout, same private/public coloring. Implemented by copying the relevant CSS classes rather than importing `MessageEntry`, to avoid pulling in drag-and-drop refs and store dependencies that would couple the inspector to the timeline.
**Interaction:** clicking calls `inspection.navigateTo(message.id)`.
**Excluded:** drag-and-drop, cost badge, mention-on-doubleclick, mute state, canInspect guard.

## State changes

### UI store (`src/vue/stores/ui.ts`)

**Removed:**

- `inspectionTargetType: 'message' | 'trace'`
- `selectedTraceId: string | null`
- `selectedMessageId: string | null` (moved to inspection store as derived from history)
- `activeInspectionTab: InspectionTab` (old 6-value type)

**Changed:**

- `InspectionTab` type redefined as `'agent' | 'request' | 'result'` (was `'overview' | 'causality' | 'context' | 'output' | 'infra' | 'raw-json'`)
- `activeInspectionTab: InspectionTab` default value changed to `'agent'`

**Kept:**

- `showRequestInspection: boolean`

**Impact on related files:**

- `defaultUiState()` in `ui.ts` — change `activeInspectionTab` default from `'overview'` to `'agent'`; remove removed fields
- `resetChatScopedState()` in `ui.ts` — update accordingly
- `uiPersistence.ts` — **no changes needed** (`activeInspectionTab` is not persisted)
- `ChatScopedUiStateSnapshot` type — remove removed fields, update tab type

### Inspection store (`src/vue/stores/inspection.ts`)

**Removed:**

- `openForTrace(traceId, messageId?)` — no longer a public entry point
- `selectTrace(traceId)` — removed
- `selectMessage(messageId)` — removed (replaced by `navigateTo`)
- `currentTrace` computed — replaced by `traceForCurrentMessage`
- `relatedTraces` computed
- `messageGraph` computed
- `relatedMessagesForTrace(trace)` method
- `currentMessage` computed — replaced by `currentInspectedMessage`

**Added / changed:**

- `inspectionHistory: string[]` — stored in this store (not UI store), list of message IDs
- `inspectionHistoryIndex: number` — current position in stack
- `currentInspectedMessage` computed — `findMessageById(state, inspectionHistory[inspectionHistoryIndex])`
- `traceForCurrentMessage` computed — looks up trace using `currentInspectedMessage.sourceTraceId` as a key into `diagnosticsStore.diagnostics.requestTraces` (a `Record<string, RequestTrace>`). If `sourceTraceId` is absent or not found in the map, returns null. Does not scan all traces.
- `agentForCurrentMessage` computed — looks up `AgentConfig` in `runtimeStore.state.agents` by `trace.agentId`. Returns null if trace is null or agent not found (deleted agent scenario).
- `contextMessagesForCurrentTrace` computed — resolves `trace.visibleMessageIds` to `ChatMessage[]` from `state.timeline`; filters out IDs not found silently.
- `openForMessage(messageId)` — new implementation: sets `inspectionHistory = [messageId]`, `inspectionHistoryIndex = 0`, `ui.showRequestInspection = true`, `ui.activeInspectionTab = 'agent'`. Replaces old implementation which set `inspectionTargetType` etc.
- `navigateTo(messageId)`, `navigateBack()`, `navigateForward()` — as described above
- `canInspectMessage(message)` — simplified: returns `false` for system messages, `true` for all others (human and agent messages are always inspectable under the new design; the guard no longer checks for trace existence)
- `setTab(tab)` — **removed**; the `RequestInspectionModal` sets `ui.activeInspectionTab` directly. The `InspectionTab` type **remains exported from `ui.ts`**; `inspection.ts` no longer imports it after this change.
- `close()` — **kept** as-is

**Kept:**

- `participantName(participantId)` utility
- `getRequestTrace(traceId)` — kept for internal use if needed by Raw JSON

### MessageEntry (`src/vue/components/timeline/MessageEntry.vue`)

`handleInspect` simplified to always call `inspection.openForMessage(entry.message.id)` for any non-system message. Remove the branching logic that checked `sourceTraceId` and called `openForTrace`.

## What is removed

- Left navigation rail (Caused by / Caused next / Fallbacks / Errors sections)
- Tabs: Overview, Causality, Context, Output, Infra, Raw JSON
- `openForTrace` public API
- `inspectionTargetType` and `selectedTraceId` state
- `currentTrace` / `relatedTraces` / `messageGraph` computeds in inspection store
- Separate "Request trace" header label

## Files affected

| File                                                       | Change                                                                                                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/vue/stores/ui.ts`                                     | Remove `inspectionTargetType`, `selectedTraceId`, `selectedMessageId`; redefine `InspectionTab` type; update `defaultUiState`, `resetChatScopedState`, `ChatScopedUiStateSnapshot` |
| `src/vue/utils/uiPersistence.ts`                           | No changes needed                                                                                                                                                                  |
| `src/vue/stores/inspection.ts`                             | Major rewrite per state changes above                                                                                                                                              |
| `src/vue/components/RequestInspectionModal.vue`            | Full rewrite — new 3-tab layout                                                                                                                                                    |
| `src/vue/components/timeline/MessageEntry.vue`             | Simplify `handleInspect`; update `canInspectMessage` usage                                                                                                                         |
| `src/vue/components/timeline/InspectorMessageLine.vue`     | New component                                                                                                                                                                      |
| `tests/vue/components/multi-agent-chat/inspection.test.ts` | Update tests to new API                                                                                                                                                            |
