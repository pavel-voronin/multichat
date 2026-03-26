# Remove Private-Exclusive Sweep Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `applyPrivateExclusive` queue branch so all sweeps (including private-message-triggered ones) flow through the general visibility-based mechanism.

**Architecture:** Delete `private-exclusive.ts` and its call site in `turn-ordering.ts`. The existing `hasNewVisibleInputForAgent` check in `runAgentTurnFn` already produces identical observable results — non-recipients are skipped at turn time because they cannot see the private message. Two new runtime tests validate the mechanism: one confirms the fix resolves a real suppression bug, one guards against over-including agents.

**Tech Stack:** TypeScript, Vitest (`npm test`), sequential test isolation via deterministic `idGenerator`.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `tests/core/runtime/sweeps.test.ts` — add two tests |
| Modify | `src/core/turn-ordering.ts` — remove import and call |
| Delete | `src/core/turn-ordering/private-exclusive.ts` |
| Delete | `tests/core/turn-ordering/private-exclusive.test.ts` |
| Modify | `tests/core/turn-ordering/build-agent-queue.test.ts` — remove one test |

---

## Task 1: Write the regression test that exposes the suppression bug

This test will **fail** with the current code and **pass** after the fix. It captures the exact scenario from acceptance criterion 4: an agent (Alpha) that ran before Beta's public message was sent gets suppressed in the next sweep because a later agent (Gamma) sent a private to Beta, making Beta the sole queue member under `applyPrivateExclusive`.

**Files:**
- Modify: `tests/core/runtime/sweeps.test.ts`

- [ ] **Step 1: Add the failing test**

Open `tests/core/runtime/sweeps.test.ts`. Add this test inside the `describe('MultiChatRuntime sweeps', () => {` block, after the last existing test:

```typescript
it('agent with new public input gets a turn when a later agent sends private to someone else', async () => {
  const callsPerSweep: Record<number, string[]> = {};
  let betaId = '';
  let gammaId = '';

  const runtime = createRuntime({
    transport: createTransport(async (agentId) => {
      const state = runtime.getState();
      const sweep = state.execution.sweepCount;
      const name = state.agents.find((a) => a.id === agentId)?.name ?? agentId;
      (callsPerSweep[sweep] ??= []).push(name);

      // Beta sends public "from beta" on its first turn
      if (agentId === betaId) {
        const visible = runtime.getVisibleMessagesForAgent(agentId);
        if (!visible.some((m) => m.senderId === betaId)) {
          return {
            mode: 'tools' as const,
            action: { type: 'speak_public' as const, text: 'from beta' },
          };
        }
      }

      // Gamma sends private to Beta on its first turn (after seeing "from beta")
      if (agentId === gammaId) {
        const visible = runtime.getVisibleMessagesForAgent(agentId);
        if (
          visible.some((m) => m.senderId === betaId) &&
          !visible.some((m) => m.senderId === gammaId)
        ) {
          return {
            mode: 'tools' as const,
            action: { type: 'send_private' as const, text: 'hey beta', to: betaId },
          };
        }
      }

      return {
        mode: 'tools' as const,
        action: { type: 'stay_silent' as const, reason: 'done' },
      };
    }),
  });

  runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: '' });
  runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: '' });
  runtime.createAgent({ name: 'Gamma', modelId: 'c', systemPrompt: '' });
  runtime.updateSettings({ openRouterApiKey: 'test-key' });

  [, betaId, gammaId] = runtime.getState().agents.map((a) => a.id);

  await runtime.sendMessage({
    senderId: 'human',
    content: 'start',
    target: 'public',
  });

  // Sweep 1: Alpha stayed silent (no input yet when it ran),
  // Beta sent public "from beta", Gamma sent private to Beta
  expect(callsPerSweep[1]).toEqual(['Alpha', 'Beta', 'Gamma']);

  // Sweep 2: Gamma's private to Beta was the last message in sweep 1.
  // Alpha ran before "from beta" appeared → "from beta" is new for Alpha.
  // Beta has Gamma's private as new input.
  // Gamma has no new visible input (cannot see its own private in non-self context).
  // Both Alpha and Beta must get a turn — Alpha must not be suppressed.
  expect(callsPerSweep[2]).toEqual(['Alpha', 'Beta']);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- tests/core/runtime/sweeps.test.ts
```

Expected: the new test FAILS with something like:
```
AssertionError: expected [ 'Beta' ] to deeply equal [ 'Alpha', 'Beta' ]
```
All other tests in the file pass. If anything else fails, stop and investigate before continuing.

---

## Task 2: Remove `applyPrivateExclusive` from queue construction

**Files:**
- Modify: `src/core/turn-ordering.ts`
- Delete: `src/core/turn-ordering/private-exclusive.ts`

- [ ] **Step 1: Update `turn-ordering.ts`**

Open `src/core/turn-ordering.ts`. It currently reads:

```typescript
import { applyMentionBoost } from './turn-ordering/mention-boost';
import { applyPrivateExclusive } from './turn-ordering/private-exclusive';
import { applyCheapFirst } from './turn-ordering/strategies/cheap-first';
// ... other imports ...

export function buildAgentQueue(
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  const activeAgents = getActiveAgents(tab);
  const exclusiveQueue = applyPrivateExclusive(activeAgents, triggeringMessage);
  if (exclusiveQueue) {
    return exclusiveQueue;
  }

  const baseQueue = applyStrategy(activeAgents, tab, triggeringMessage);
  return applyMentionBoost(baseQueue, triggeringMessage);
}
```

Replace the entire file content with:

```typescript
import { getActiveAgents } from './context-routing';
import type {
  ChatTabState,
  AgentConfig,
  ParticipantMessageEntry,
} from './types';
import { applyMentionBoost } from './turn-ordering/mention-boost';
import { applyCheapFirst } from './turn-ordering/strategies/cheap-first';
import { applyExpensiveFirst } from './turn-ordering/strategies/expensive-first';
import { applyKeywords } from './turn-ordering/strategies/keywords';
import { applyManualOrder } from './turn-ordering/strategies/manual-order';
import { applyRandom } from './turn-ordering/strategies/random';
import { applySequential } from './turn-ordering/strategies/sequential';
import { applySlidingCycle } from './turn-ordering/strategies/sliding-cycle';

function applyStrategy(
  agents: AgentConfig[],
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  switch (tab.turnOrdering.strategy) {
    case 'sequential':
      return applySequential(agents);
    case 'cheap_first':
      return applyCheapFirst(agents);
    case 'expensive_first':
      return applyExpensiveFirst(agents);
    case 'random':
      return applyRandom(agents, tab.execution.sweepCount);
    case 'keywords':
      return applyKeywords(
        agents,
        tab.turnOrdering.keywords,
        triggeringMessage,
      );
    case 'manual_order':
      return applyManualOrder(agents, tab.turnOrdering.order);
    case 'sliding_cycle':
      return applySlidingCycle(agents, tab.turnOrdering.offset);
  }
}

export function buildAgentQueue(
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  const activeAgents = getActiveAgents(tab);
  const baseQueue = applyStrategy(activeAgents, tab, triggeringMessage);
  return applyMentionBoost(baseQueue, triggeringMessage);
}
```

- [ ] **Step 2: Delete `private-exclusive.ts`**

```bash
rm src/core/turn-ordering/private-exclusive.ts
```

- [ ] **Step 3: Run the regression test to confirm it now passes**

```bash
npm test -- tests/core/runtime/sweeps.test.ts
```

Expected: all tests in the file pass, including the new one. The `callsPerSweep[2]` assertion now yields `['Alpha', 'Beta']`.

---

## Task 3: Add the agent-to-agent private regression guard

This test verifies that removing private-exclusive does **not** over-include agents: an agent with no new visible input (Gamma, which cannot see Beta's private to Alpha) is correctly skipped via the `no_new_input` mechanism, not accidentally called.

This test passes both before and after the code change — it is a safety net, not a bug demonstration.

**Files:**
- Modify: `tests/core/runtime/sweeps.test.ts`

- [ ] **Step 1: Add the guard test**

Add this test inside the same `describe` block, after the test added in Task 1:

```typescript
it('agent-to-agent private: only the recipient gets a turn in the subsequent sweep', async () => {
  const callsPerSweep: Record<number, string[]> = {};
  let alphaId = '';
  let betaId = '';

  const runtime = createRuntime({
    transport: createTransport(async (agentId) => {
      const state = runtime.getState();
      const sweep = state.execution.sweepCount;
      const name = state.agents.find((a) => a.id === agentId)?.name ?? agentId;
      (callsPerSweep[sweep] ??= []).push(name);

      // Beta sends private to Alpha on its first turn
      if (agentId === betaId) {
        const visible = runtime.getVisibleMessagesForAgent(agentId);
        if (!visible.some((m) => m.senderId === betaId)) {
          return {
            mode: 'tools' as const,
            action: { type: 'send_private' as const, text: 'just for you', to: alphaId },
          };
        }
      }

      return {
        mode: 'tools' as const,
        action: { type: 'stay_silent' as const, reason: 'done' },
      };
    }),
  });

  runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: '' });
  runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: '' });
  runtime.createAgent({ name: 'Gamma', modelId: 'c', systemPrompt: '' });
  runtime.updateSettings({ openRouterApiKey: 'test-key' });

  [alphaId, betaId] = runtime.getState().agents.map((a) => a.id);

  await runtime.sendMessage({
    senderId: 'human',
    content: 'start',
    target: 'public',
  });

  // Sweep 1: all three agents see "start", Beta sends private to Alpha
  expect(callsPerSweep[1]).toEqual(['Alpha', 'Beta', 'Gamma']);

  // Sweep 2: only Alpha has new visible input (Beta's private).
  // Gamma cannot see the private message → no new input → correctly not called.
  expect(callsPerSweep[2]).toEqual(['Alpha']);
});
```

- [ ] **Step 2: Run the test to confirm it passes**

```bash
npm test -- tests/core/runtime/sweeps.test.ts
```

Expected: all tests pass.

---

## Task 4: Remove the tests that covered the deleted module

Two places tested `applyPrivateExclusive` directly or asserted queue construction behaviour that no longer holds.

**Files:**
- Delete: `tests/core/turn-ordering/private-exclusive.test.ts`
- Modify: `tests/core/turn-ordering/build-agent-queue.test.ts`

- [ ] **Step 1: Delete `private-exclusive.test.ts`**

```bash
rm tests/core/turn-ordering/private-exclusive.test.ts
```

- [ ] **Step 2: Remove the stale queue-construction test**

Open `tests/core/turn-ordering/build-agent-queue.test.ts`. Remove the test below in its entirety (lines 74–84 in the original file):

```typescript
  it('returns only recipient on private triggering messages', () => {
    const alpha = makeAgent('alpha', 'Alpha');
    const beta = makeAgent('beta', 'Beta');
    const tab = makeTab([alpha, beta]);

    expect(
      buildAgentQueue(tab, makeMessage('private hello', 'private', 'beta')).map(
        (agent) => agent.name,
      ),
    ).toEqual(['Beta']);
  });
```

After removal the file should contain two tests: `'applies strategy first and then mention boost'` and `'uses chat order fallback for keywords when there is no match'`.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests pass, no failures, no compilation errors. Count of test files should be one less than before (private-exclusive.test.ts removed).

---

## Task 5: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add \
  src/core/turn-ordering.ts \
  tests/core/runtime/sweeps.test.ts \
  tests/core/turn-ordering/build-agent-queue.test.ts
git rm \
  src/core/turn-ordering/private-exclusive.ts \
  tests/core/turn-ordering/private-exclusive.test.ts
git commit -m "$(cat <<'EOF'
refactor: remove private-exclusive sweep routing

Private messages are now handled through the general sweep mechanism.
The hasNewVisibleInputForAgent check already correctly skips non-recipients
(they cannot see the private message), making the exclusive queue branch
redundant and harmful — it suppressed agents with new public input when
the last sweep message happened to be private to someone else.

Adds two runtime tests:
- regression test for the suppression bug (was failing, now passes)
- guard test confirming non-recipients are correctly skipped post-fix

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Remove `applyPrivateExclusive` from queue construction | Task 2 |
| Delete private-exclusive module | Task 2 |
| Delete now-obsolete tests | Task 4 |
| Add regression tests for private sweep behavior | Tasks 1, 3 |
| No change to visibility rules | n/a — nothing in context-routing.ts touched |
| No change to prompt construction | n/a — nothing in execution.ts touched |
| Existing runtime tests continue passing | Verified in Task 2 Step 3 and Task 4 Step 3 |

**AC mapping:**

| AC | Covered by |
|---|---|
| 1. Private message does not restrict queue to one recipient | Task 2 (code change) + Task 1 (test) |
| 2. Recipient can still react through normal sweep flow | Task 3 (agent-to-agent guard test) |
| 3. Agents with unchanged visible context are skipped | Task 3 (Gamma correctly not called) |
| 4. Multiple privates in a sweep don't suppress others with new input | Task 1 (the bug test) |
| 5. No regression in public-message sweep behavior | Task 4 Step 3 (full suite) |
| 6. Existing sweep tests pass without modification | Task 2 Step 3 |
