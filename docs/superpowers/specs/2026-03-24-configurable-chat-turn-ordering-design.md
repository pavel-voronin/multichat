# Configurable Chat Turn Ordering — Design Spec

**Date:** 2026-03-24
**Status:** Approved

---

## Overview

Each chat gets a configurable strategy that determines the order in which agents receive their turn in a sweep. Two global rules — mention boost and private exclusive delivery — apply on top of any strategy.

---

## File Structure

```
src/core/
  turn-ordering.ts                    # Public API: buildAgentQueue()
  turn-ordering/
    types.ts                          # TurnOrderingConfig discriminated union
    mention-boost.ts                  # Global rule: mention boost
    private-exclusive.ts              # Global rule: private exclusive delivery
    strategies/
      sequential.ts
      cheap-first.ts
      expensive-first.ts
      random.ts
      keywords.ts
      manual-order.ts
      sliding-cycle.ts
```

---

## Data Model

### `TurnOrderingConfig` (in `turn-ordering/types.ts`)

```typescript
type TurnOrderingConfig =
  | { strategy: 'sequential' }
  | { strategy: 'cheap_first' }
  | { strategy: 'expensive_first' }
  | { strategy: 'random' }
  | { strategy: 'keywords'; keywords: Record<string, string[]> }
  | { strategy: 'manual_order'; order: string[] }
  | { strategy: 'sliding_cycle'; offset: number }

const DEFAULT_TURN_ORDERING: TurnOrderingConfig = { strategy: 'sequential' }
```

### `ChatTabState`

Add one field:

```typescript
interface ChatTabState {
  // ...existing fields
  turnOrdering: TurnOrderingConfig
}
```

`sliding_cycle.offset` is part of the persisted config. See "Sliding Cycle Offset Management" below.

`keywords` keys are agent names; matching is case-insensitive at runtime.

---

## Migration

`createEmptyTabState()` in `workspace.ts` must include `turnOrdering: DEFAULT_TURN_ORDERING` in its return value.

`normalizeTabState()` in `workspace.ts` must fall back to `DEFAULT_TURN_ORDERING` when the persisted data has no `turnOrdering` field, to handle chats created before this feature.

---

## Public API

```typescript
// turn-ordering.ts
export function buildAgentQueue(
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[]
```

`execution.ts` replaces the `getActiveAgents(tab)` call in the **sweep loop** with `buildAgentQueue(tab, triggeringMessage)`. The separate `getActiveAgents(tab)` call in `getPromptParticipants` is **not replaced** — it is about prompt context, not turn ordering.

`buildAgentQueue` reads `tab.execution.sweepCount` internally and forwards it to all strategy functions.

### Sourcing `triggeringMessage`

At the `buildAgentQueue` call site in `runAgentSweepFn`, `triggeringMessage` is the most recent `ParticipantMessageEntry` in `tab.timeline` at the moment the sweep begins, regardless of whether it was authored by a human or an agent. If no such entry exists, `triggeringMessage` is `null`.

This single lookup happens once at the start of each sweep, before the agent loop begins.

---

## Queue Construction — Three Steps

### Step 1: Private Exclusive Delivery

If `triggeringMessage` is private and has a named recipient:
- Return `[recipient]` immediately; steps 2 and 3 are skipped.
- Other agents are excluded from the queue and receive no turn this sweep.
- Context visibility of the private message for non-recipients is already enforced separately by `isEntryVisibleToAgent` in `context-routing.ts`; `buildAgentQueue` does not change visibility logic.
- After the exclusive sweep, normal ordering resumes on the next sweep.

### Step 2: Base Order (strategy)

Each strategy file exports a pure function:

```typescript
(agents: AgentConfig[], config: StrategyConfig, sweepCount: number) => AgentConfig[]
```

The `agents` list is the result of `getActiveAgents(tab)` (filtered for enabled, non-hidden agents) before any ordering is applied.

| Strategy | Logic |
|---|---|
| `sequential` | Chat agent order |
| `cheap_first` | Sort ascending by model price; agents with missing pricing treated as price 0 (sort first); tie-break by chat order |
| `expensive_first` | Sort descending by model price; agents with missing pricing treated as price 0 (sort last); tie-break by chat order |
| `random` | Seeded shuffle; seed = `sweepCount`; reproducible within a session (same sweep count → same order); cross-session reproducibility is not required |
| `keywords` | Agents with keyword match in triggering message go first; tie-break by chat order; no match or `triggeringMessage` is `null` → fallback to chat order |
| `manual_order` | Follow `order[]` by agent name (case-insensitive); unlisted agents appended by chat order |
| `sliding_cycle` | Rotate ring by `offset` positions; ring defined by chat agent order |

**Fallback rule:** All tie-breaking and unlisted-agent ordering falls back to the agent's position in `tab.agents`.

### Step 3: Mention Boost

Inspect `triggeringMessage.content`. Apply the following algorithm to detect mentions:

1. Find the index of the first `:` in the content.
2. If no `:` is found, or it appears after a newline: no mention detected; queue unchanged.
3. Take the substring before `:` as the candidate prefix.
4. Split the candidate prefix on `,`.
5. Trim each token.
6. Match each token case-insensitively against active agent names.
7. Tokens that match a known agent name are "mentioned agents"; unmatched tokens are ignored.
8. If at least one agent is matched: move matched agents to the front of the queue in the order they appeared; remaining agents keep their Step 2 order.
9. If no agents are matched: queue is unchanged.

---

## Sliding Cycle Offset Management

- `offset` is stored in `TurnOrderingConfig` and persisted with the chat.
- After each sweep completes normally, `MultiChatRuntime.runAgentSweep()` checks whether the current strategy is `sliding_cycle`. If so, it increments `offset` by 1 modulo the current active agent count, then persists the updated `turnOrdering` config.
- A sweep that is stopped early (`stopRequested`) does **not** advance the offset — the sweep did not fully complete.
- When an agent is added: added to the start of the ring; offset unchanged.
- When an agent is removed: removed from the ring; offset unchanged (wraps naturally via modulo).

---

## UI

Located in chat settings panel only — no always-visible indicator.

### Strategy Selector

Dropdown with options (displayed in this order):
- Sequential *(default)*
- Random
- Cheap first
- Expensive first
- Keywords
- Manual order
- Sliding cycle

### Strategy Parameters

Rendered below the dropdown, conditional on selection:

| Strategy | UI |
|---|---|
| `sequential`, `cheap_first`, `expensive_first`, `random`, `sliding_cycle` | No parameters shown |
| `keywords` | Table: one row per active agent, agent name label + text input for comma-separated keywords |
| `manual_order` | Drag-and-drop list of all currently active (enabled, non-hidden) agents |

### `manual_order` drag-and-drop

- Shows all currently active agents as draggable items.
- Disabled or hidden agents are not shown in the list.
- User reorders by dragging.
- Saved order is written to `TurnOrderingConfig.order` as an array of agent names.
- Agents added after saving appear at the end of the queue via the fallback rule (chat order).

---

## Open Questions

- **Keywords UI:** How keyword configuration is surfaced for chats with many agents is not fully specified for v1. The per-agent table approach above is the working assumption.

---

## Acceptance Criteria

1. User can select a turn ordering strategy per chat in chat settings.
2. Runtime builds the base queue using the selected strategy.
3. Mention boost is applied on top of any strategy.
4. Multiple mentions in prefix are ordered as written.
5. Private message triggers exclusive sweep for the recipient only; other agents receive no turn.
6. Private message visibility for non-recipients is unchanged (enforced by existing `isEntryVisibleToAgent`).
7. `keywords` matches only the triggering message; rule-based only, no LLM; falls back to chat order when `triggeringMessage` is `null`.
8. `random` uses seeded shuffle; same `sweepCount` → same order.
9. `sliding_cycle` advances offset by 1 per sweep; offset wraps to 0 when it reaches active agent count.
10. `manual_order` drag-and-drop saves agent order by name; disabled/hidden agents are excluded from the UI.
11. All tie-breaking falls back to chat agent order.
12. The orchestrator determines turn order; agents decide whether to speak.
13. Chats persisted before this feature load without error, defaulting to `sequential`.
14. `cheap_first` / `expensive_first` treat agents with missing pricing as price 0.
