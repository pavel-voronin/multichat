---
title: Remove Private-Exclusive Sweep Routing
date: 2026-03-26
status: approved
---

# Remove Private-Exclusive Sweep Routing

## Problem

When the triggering message of a sweep is private, `buildAgentQueue` calls `applyPrivateExclusive`, which short-circuits the entire queue-building pipeline and returns only the single recipient. This creates a special branch in sweep orchestration that is both redundant and fragile.

The existing `hasNewVisibleInputForAgent` check in `runAgentTurnFn` already produces the same result through visibility rules: non-recipients cannot see a private message, so they naturally get no new visible input and are skipped. The exclusive queue branch duplicates this logic and prevents future sweep improvements from applying uniformly.

## Key Insight

`applyPrivateExclusive` and `hasNewVisibleInputForAgent` are behaviorally equivalent for all possible private-message scenarios. If the triggering message is private from A to B:

- B sees it → has new visible input → gets a turn
- Every other agent cannot see it → `hasNewVisibleInputForAgent` returns `false` → skipped via `no_new_input`

Removing the exclusive branch changes the mechanism but not the observable result.

## Design

### What changes

**`src/core/turn-ordering.ts`**
Remove the `applyPrivateExclusive` import and its early-return call from `buildAgentQueue`. The function becomes a straight pipeline: strategy → mention boost.

```ts
export function buildAgentQueue(
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  const activeAgents = getActiveAgents(tab);
  const baseQueue = applyStrategy(activeAgents, tab, triggeringMessage);
  return applyMentionBoost(baseQueue, triggeringMessage);
}
```

**`src/core/turn-ordering/private-exclusive.ts`**
Delete. No longer referenced anywhere.

### What does not change

- Visibility rules (`isEntryVisibleToAgent`) — untouched.
- `hasNewVisibleInputForAgent` — untouched.
- Prompt construction — untouched.
- All turn-ordering strategies — untouched.
- Sweep limits, stop behavior, auto-round logic — untouched.

## Test Changes

### Delete

- `tests/core/turn-ordering/private-exclusive.test.ts` — tests the deleted module.
- The test `"returns only recipient on private triggering messages"` in `tests/core/turn-ordering/build-agent-queue.test.ts` — it asserts queue construction restricts to one agent, which is no longer true. After the change, the queue contains all active agents; filtering moves to turn execution.

### Keep as-is (runtime behavior unchanged)

All existing `sweeps.test.ts` tests that assert only the recipient responds to a private message will continue to pass — the observable outcome is the same, just the mechanism differs.

### Add to `tests/core/runtime/sweeps.test.ts`

**Test 1: agent-to-agent private — third agent is skipped via `no_new_input`**

Three agents. Human sends public "start". During sweep 1, Beta sends a private to Alpha. Verify that Gamma is skipped because it has no new visible input (not because it was excluded from the queue). Observable via `getDiagnosticsState().debugLogs`: Gamma's skip entry should have `skipReason: 'no_new_input'`, confirming the mechanism is the visibility check, not queue exclusion.

**Test 2: private and public messages in the same multi-round sweep**

Three agents. Human sends "start". Alpha sends a public reply in sweep 1. Beta sends a private to Alpha in sweep 1 (after Alpha's turn). In sweep 2: Alpha gets both the public reply as "previously seen" and Beta's private as new input → Alpha runs. Gamma, which ran after Alpha's public in sweep 1, has no new input → skipped. Verify final timeline contains exactly the expected messages and no agent responds more times than expected.

## Acceptance Criteria

1. A private message does not force the next sweep to run for only one recipient.
2. An agent who received a new private message still reacts through the normal sweep flow.
3. Agents with unchanged visible context are skipped via `no_new_input`, not queue exclusion.
4. Multiple private messages in a running sweep do not suppress other agents with new visible input.
5. No regression in public-message sweep behavior.
6. All existing sweep tests pass without modification.
