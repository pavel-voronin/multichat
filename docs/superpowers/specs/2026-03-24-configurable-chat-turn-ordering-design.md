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

`sliding_cycle.offset` is part of the persisted config. It is incremented by `runtime.ts` after each sweep completes, using the existing `updateTab`-style mechanism.

`keywords` keys are agent names (case-insensitive match at runtime).

---

## Public API

```typescript
// turn-ordering.ts
export function buildAgentQueue(
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[]
```

`execution.ts` replaces `getActiveAgents(tab)` with `buildAgentQueue(tab, triggeringMessage)`.

`sweepCount` from `ExecutionState` is passed into strategy functions for seeding random.

---

## Queue Construction — Three Steps

### Step 1: Private Exclusive Delivery

If `triggeringMessage` is private and has a recipient: return `[recipient]` immediately. Steps 2 and 3 are skipped.

- Only the recipient participates in this sweep
- Other agents receive no context, no turn
- After the exclusive sweep, normal ordering resumes

### Step 2: Base Order (strategy)

Each strategy file exports a pure function:

```typescript
(agents: AgentConfig[], config: StrategyConfig, sweepCount: number) => AgentConfig[]
```

| Strategy | Logic |
|---|---|
| `sequential` | Chat agent order |
| `cheap_first` | Sort ascending by model price; tie-break by chat order |
| `expensive_first` | Sort descending by model price; tie-break by chat order |
| `random` | Seeded shuffle; seed = `sweepCount`; reproducible per sweep |
| `keywords` | Agents with keyword match in last message go first; tie-break by chat order; no match → fallback to chat order |
| `manual_order` | Follow `order[]` by agent name; unlisted agents appended by chat order |
| `sliding_cycle` | Rotate ring by `offset` positions; ring defined by chat agent order |

**Fallback rule:** All tie-breaking and unlisted-agent ordering falls back to the agent's position in `tab.agents`.

### Step 3: Mention Boost

Parse the prefix of `triggeringMessage.content` for pattern `Name:` or `Name1, Name2:` (case-insensitive). Mentioned agents move to the front in mention order; remaining agents keep their Step 2 order.

If the prefix does not match the pattern: queue is unchanged.

---

## Sliding Cycle Offset Management

- `offset` is stored in `TurnOrderingConfig` and persisted with the chat
- After each sweep where strategy is `sliding_cycle`, runtime increments `offset` by 1 modulo agent count
- When an agent is added: added to the start of the ring; offset unchanged
- When an agent is removed: removed from the ring; offset unchanged (wraps naturally)

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
| `keywords` | Table: one row per agent, agent name + text input for comma-separated keywords |
| `manual_order` | Drag-and-drop list of all active agents; drag to reorder |

### `manual_order` drag-and-drop

- Shows all currently active agents as draggable items
- User reorders by dragging
- Saved order is written to `TurnOrderingConfig.order` as an array of agent names
- Agents added after saving are appended to the queue by chat order (existing fallback rule)

---

## Open Questions

- **Keywords UI:** How keyword config is surfaced for agents with many keywords is not fully specified for v1. The table approach above is the working assumption.

---

## Acceptance Criteria

1. User can select a turn ordering strategy per chat in chat settings.
2. Runtime builds the base queue using the selected strategy.
3. Mention boost is applied on top of any strategy.
4. Multiple mentions in prefix are ordered as written.
5. Private message triggers exclusive sweep for the recipient only.
6. Private message does not enter visibility or ordering of other agents.
7. `keywords` matches only the triggering message; rule-based only, no LLM.
8. `random` uses seeded shuffle; same sweep count → same order.
9. `sliding_cycle` advances offset by 1 per sweep.
10. `manual_order` drag-and-drop saves agent order by name.
11. All tie-breaking falls back to chat agent order.
12. The orchestrator determines turn order; agents decide whether to speak.
