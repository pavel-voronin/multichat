# Multi-Tool Calls Per Agent Turn

**Date:** 2026-04-01
**Status:** Approved

## Problem

Each agent turn is currently limited to exactly one tool call. This is enforced at five layers: the OpenRouter API request (`parallel_tool_calls: false`), the parser (`tool_calls?.[0]`), the type (`action: AgentToolCall`), the prompt ("produce exactly one final action per turn"), and execution (single `sendMessage` call).

The product needs agents to emit any number of tool calls per turn — for example, `speak_public` and `send_private` in the same turn.

## Design

### Approach

Replace every singular `action` with a plural `actions[]` throughout the stack (Variant B). No backward-compatibility shims — all consumers are updated in the same change.

### 1. Transport layer (`src/core/openrouter.ts`)

- Remove `parallel_tool_calls: false` from the request body.
- Replace `message.tool_calls?.[0]` with a loop over the full `tool_calls` array.
- Parse each tool call via the existing `parseToolAction()`.
- Apply normalization: if at least one non-`stay_silent` action exists, drop all `stay_silent` entries; if all entries are `stay_silent`, return an empty `actions` array.
- Return `actions: AgentToolCall[]` on `AgentTurnResult`.

### 2. Types (`src/core/types.ts`)

```ts
interface AgentTurnResult {
  mode: AgentExecutionMode;
  actions: AgentToolCall[];   // was: action: AgentToolCall
  usage?: TransportUsage;
}

interface RequestTrace {
  producedMessageIds: string[];            // was: producedMessageId?: string
  payloads: {
    normalizedActionsJson?: unknown;       // was: normalizedActionJson
    // other payload fields unchanged
  }
}
```

`AgentToolCall` union is unchanged — `stay_silent` is still a valid parse target.

### 3. Prompt (`src/core/agentProtocol.ts`)

Remove: `"You must produce exactly one final action per turn."`

Replace with:
- You may produce any number of tool calls per turn.
- Call every tool needed to complete your turn.
- `stay_silent` means "no message from this call" — if you also call a speaking tool, `stay_silent` is ignored.

### 4. Execution (`src/core/execution.ts`)

`handleSuccessfulAgentTurnResultFn` iterates `result.actions`:

- If `actions` is empty (silent turn): create one silent decision entry, push one debug log, return.
- For each action in order: call `sendMessage`, attach the produced message ID to the trace.
- All messages share the same `sourceTraceId` and `createdInSweep`.
- Request cost is attached to the trace once — not per message.
- `tab.execution.queuedSweep = true` if at least one message was produced.

`completeRequestTrace` receives `actions: AgentToolCall[]` instead of `action`.
`attachProducedMessageToTrace` appends to `producedMessageIds[]` instead of setting `producedMessageId`.

Debug log (`turn-result`) shape:

```ts
{
  kind: 'turn-result',
  actionCount: number,
  actionTypes: Array<'speak_public' | 'send_private' | 'stay_silent'>,
  messageIds?: string[],
  recipientIds?: string[],
}
```

One log entry per turn, not per message.

### 5. Diagnostics (`src/core/diagnostics.ts`)

- `completeRequestTrace`: store `normalizedActionsJson` (array) instead of `normalizedActionJson`.
- `attachProducedMessageToTrace`: push to `producedMessageIds[]` and `downstreamMessageIds`.

### 6. Inspector (`src/vue/components/inspection/`)

Output tab:

- Replace singular "Action" field with plural "Actions" list.
- Render an ordered list: `1. Published to public chat`, `2. Sent privately to Alice`, etc.
- Silent-only turn: show `No messages produced`.
- `stay_silent` entries are not shown in the effective actions list (they were filtered out).

`inspection.ts` store: `currentActionForTrace` → `currentActionsForTrace`, returning `AgentToolCall[]`.

### 7. Content (`README.md`, presets, welcome prompts)

Update any copy that says agents produce "one message" or "one action" per turn to reflect multi-action turns.

## Normalization Rules

| Input | Effective actions |
|-------|------------------|
| `[speak_public]` | `[speak_public]` |
| `[speak_public, stay_silent]` | `[speak_public]` |
| `[stay_silent]` | `[]` (silent turn) |
| `[stay_silent, stay_silent]` | `[]` (silent turn) |
| `[speak_public, send_private]` | `[speak_public, send_private]` |
| `[]` (empty) | fail turn as malformed |
| any malformed payload | fail turn |

## Edge Cases

- **Duplicate tool calls:** execute both — no deduplication.
- **Empty `tool_calls`:** fail the turn as malformed.
- **Malformed payload in array:** fail the entire turn; do not partially execute earlier valid calls.
- **`send_private` to self:** still invalid, rejected as before.
- **Cost:** one request → one cost entry on the trace, not multiplied by message count.

## Test Plan

### Update
- `tests/core/openrouter.test.ts` — remove `parallel_tool_calls` assertions, update mock return shapes
- `tests/core/runtime/sweeps.test.ts` — change `action:` to `actions:` in all transport mocks
- `tests/vue/components/multi-agent-chat/inspection.test.ts` — update inspector assertions for plural actions

### Add
1. Parser returns multiple tool calls in array order
2. `stay_silent` dropped when combined with speaking tools
3. Multiple `stay_silent` calls → empty effective action list
4. Multiple messages produced from one trace
5. One request trace with multiple `producedMessageIds`
6. Inspector output tab shows ordered action list
7. Multi-message turn continues sweep normally
8. Each produced message navigates back to the same source trace

## Acceptance Criteria

1. A single model turn may emit any number of tool calls.
2. The runtime executes every non-silent action in returned order.
3. `stay_silent` is ignored when any real action is present.
4. A silent-only turn produces no participant messages but is still traceable.
5. One request trace may be the source of multiple produced messages.
6. Inspector output clearly shows multiple actions from the same trace.
7. Sweep behavior requires no special branch for multi-tool turns.
8. Single-tool turns behave exactly as before.
