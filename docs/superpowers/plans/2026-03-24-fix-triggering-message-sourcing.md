# Fix triggeringMessage Sourcing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass `triggeringMessage` explicitly from each sweep call site instead of searching the timeline, so non-message sweeps (`createAgent`, `removeAgent`, `topicChanged`) are never incorrectly restricted by a prior private message.

**Architecture:** `runAgentSweep(trigger, triggeringMessage, tabId?)` gains a second parameter. `sendMessage` passes the just-published entry; all other sweep triggers pass `null`. Inside the do-while loop, the first iteration uses the passed value; subsequent iterations (queuedSweep) search the timeline because a new message genuinely arrived during the sweep. The `reverse().find()` anti-pattern is replaced with `findLast()` throughout.

**Tech Stack:** TypeScript, Vitest, existing `MultiChatRuntime` test helpers in `tests/core/runtime/helpers.ts`.

**Spec:** `docs/superpowers/specs/2026-03-24-configurable-chat-turn-ordering-design.md`

**Prerequisite:** This plan is applied on top of the already-implemented turn-ordering feature (`buildAgentQueue`, `advanceSlidingCycleOffset`, `TurnOrderingConfig` etc. already exist). All work must be done in the worktree at `/Users/pavel/.codex/worktrees/bf24/multichat`, not the main repo.

---

## File Map

### Modified files

- `src/core/execution.ts` — `runAgentSweepFn` gains `triggeringMessage` parameter; do-while loop uses it for first iteration, searches timeline for subsequent iterations
- `src/core/runtime.ts` — `runAgentSweep` gains `triggeringMessage` parameter; all internal call sites updated with correct values
- `tests/core/runtime/sweeps.test.ts` — new integration tests for all sweep trigger scenarios

---

## Task 1: Write failing tests

**Files:**

- Modify: `tests/core/runtime/sweeps.test.ts`

These tests use the new `runAgentSweep(trigger, triggeringMessage, tabId?)` API that does not exist yet. They will fail at runtime because TypeScript is transpiled without type-checking by Vitest/Vite — `tabId` will receive a string argument intended for `triggeringMessage` and break, or the behavior will be wrong.

- [ ] **Append these tests to `tests/core/runtime/sweeps.test.ts`**

````typescript
  it('non-message sweep is not restricted by a prior private message', async () => {
    const turns: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns.push(
          runtime.getState().agents.find((agent) => agent.id === agentId)
            ?.name ?? agentId,
        );
        return { mode: 'tools', action: { type: 'stay_silent', reason: 'test' } };
      }),
    });

    runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: 'prompt' });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const betaId = runtime.getState().agents.find((a) => a.name === 'Beta')!.id;

    // Private message to Beta — Beta stays silent, no new participant-message added
    await runtime.sendMessage({
      senderId: 'human',
      content: 'private ping',
      target: 'private',
      recipientId: betaId,
    });

    turns.length = 0; // only track the next sweep

    // Simulate a non-message sweep (e.g. participant-joined); triggeringMessage = null
    await runtime.runAgentSweep('participant-joined', null);

    // Both agents must get a turn — private exclusive must NOT apply
    expect(turns).toEqual(['Alpha', 'Beta']);
  });

  it('sendMessage sweep uses the sent entry as triggeringMessage for mention boost', async () => {
    const turns: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns.push(
          runtime.getState().agents.find((agent) => agent.id === agentId)
            ?.name ?? agentId,
        );
        return { mode: 'tools', action: { type: 'stay_silent', reason: 'test' } };
      }),
    });

    runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: 'prompt' });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    // "Beta:" prefix — mention boost should move Beta first
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Beta: please respond',
      target: 'public',
    });

    expect(turns).toEqual(['Beta', 'Alpha']);
  });

  it('sendMessage sweep is restricted to the private recipient when message is private', async () => {
    const turns: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns.push(
          runtime.getState().agents.find((agent) => agent.id === agentId)
            ?.name ?? agentId,
        );
        return { mode: 'tools', action: { type: 'stay_silent', reason: 'test' } };
      }),
    });

    runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: 'prompt' });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const betaId = runtime.getState().agents.find((a) => a.name === 'Beta')!.id;

    await runtime.sendMessage({
      senderId: 'human',
      content: 'private ping',
      target: 'private',
      recipientId: betaId,
    });

    // Only Beta must get a turn
    expect(turns).toEqual(['Beta']);
  });

  it('queued sweep uses the message that arrived during the sweep, not the original trigger', async () => {
    const allTurns: string[] = [];
    let alphaId = '';

    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        allTurns.push(
          runtime.getState().agents.find((a) => a.id === agentId)?.name ?? agentId,
        );

        // Alpha speaks once, mentioning Beta, to trigger a queued sweep
        if (agentId === alphaId) {
          const visible = runtime.getVisibleMessagesForAgent(agentId);
          const hasSpoken = visible.some((m) => m.senderId === alphaId);
          if (!hasSpoken) {
            return {
              mode: 'tools',
              action: { type: 'speak_public', text: 'Beta: your turn' },
            };
          }
        }

        return { mode: 'tools', action: { type: 'stay_silent', reason: 'done' } };
      }),
    });

    runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: 'prompt' });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });
    alphaId = runtime.getState().agents[0]!.id;

    await runtime.sendMessage({
      senderId: 'human',
      content: 'start',
      target: 'public',
    });

    // Sweep 1: Alpha, Beta (chat order) — Alpha speaks "Beta: your turn" → queuedSweep
    // Sweep 2: triggeringMessage = Alpha's message → mention boost puts Beta first
    // Total: Alpha, Beta (sweep 1), Beta, Alpha (sweep 2)
    expect(allTurns).toEqual(['Alpha', 'Beta', 'Beta', 'Alpha']);
  });

- [ ] **Run tests to confirm they fail**

```bash
cd /Users/pavel/.codex/worktrees/bf24/multichat && npm test -- tests/core/runtime/sweeps.test.ts 2>&1 | tail -30
````

Expected: test 1 (`non-message sweep`) fails — currently `turns` is `['Beta']` because private exclusive fires. Tests 2 and 3 may already pass.

- [ ] **Commit failing tests**

```bash
cd /Users/pavel/.codex/worktrees/bf24/multichat
git add tests/core/runtime/sweeps.test.ts
git commit -m "test: add failing tests for triggeringMessage sourcing via explicit parameter"
```

---

## Task 2: Fix `runAgentSweepFn` in execution.ts

**Files:**

- Modify: `src/core/execution.ts`

- [ ] **Replace the `runAgentSweepFn` signature and do-while body**

Change the signature from:

```typescript
export async function runAgentSweepFn(
  trigger: string,
  tabId: string,
  ctx: ExecutionContext,
): Promise<void>;
```

To:

```typescript
export async function runAgentSweepFn(
  trigger: string,
  triggeringMessage: ParticipantMessageEntry | null,
  tabId: string,
  ctx: ExecutionContext,
): Promise<void>;
```

Inside the function, replace the entire `do { ... } while (...)` block. The key change:

1. Before the loop, store the parameter: `let currentTriggeringMessage = triggeringMessage;`
2. Remove the `[...currentTab.timeline].reverse().find(...)` block — use `currentTriggeringMessage` instead
3. After each sweep iteration's agent loop, update `currentTriggeringMessage` for the next iteration by searching the timeline with `findLast`

Replace lines 417–497 (the `sweepPromise` IIFE body) with:

```typescript
const sweepPromise = (async () => {
  if (trigger === 'manual') {
    ctx.lastProcessedKeys.get(tabId)?.clear();
  }

  let loops = 0;
  tab.execution.stopRequested = false;
  let currentTriggeringMessage = triggeringMessage;

  do {
    const currentTab = getTab(tabId, ctx);
    if (!currentTab || currentTab.execution.stopRequested) break;

    currentTab.execution.isSweepRunning = true;
    currentTab.execution.queuedSweep = false;
    currentTab.execution.sweepCount += 1;
    pushSweepStarted({
      createId: ctx.createId,
      now: ctx.now,
      tab: currentTab,
    });
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'sweep-started',
        sweep: currentTab.execution.sweepCount,
        trigger,
      },
    });
    ctx.persistAndNotify();

    for (const agent of buildAgentQueue(currentTab, currentTriggeringMessage)) {
      const latestTab = getTab(tabId, ctx);
      if (!latestTab || latestTab.execution.stopRequested) break;
      await runAgentTurnFn(agent, tabId, ctx);
    }

    const latestTab = getTab(tabId, ctx);
    if (!latestTab) break;

    latestTab.execution.isSweepRunning = false;
    if (!latestTab.execution.stopRequested) {
      ctx.advanceSlidingCycleOffset(tabId);
    }
    pushSweepFinished({
      createId: ctx.createId,
      now: ctx.now,
      tab: latestTab,
    });
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'sweep-finished',
        sweep: latestTab.execution.sweepCount,
        trigger,
      },
    });
    ctx.persistAndNotify();
    loops += 1;

    // For the next queued-sweep iteration, the triggering message is whatever
    // participant-message arrived during this sweep.
    const nextTab = getTab(tabId, ctx);
    if (nextTab) {
      currentTriggeringMessage =
        nextTab.timeline.findLast(
          (entry): entry is ParticipantMessageEntry =>
            entry.kind === 'participant-message',
        ) ?? null;
    }
  } while (
    getTab(tabId, ctx)?.execution.queuedSweep &&
    loops < ctx.maxAutoSweeps &&
    !getTab(tabId, ctx)?.execution.stopRequested
  );

  const finalTab = getTab(tabId, ctx);
  if (finalTab) {
    finalTab.execution.isSweepRunning = false;
    finalTab.execution.queuedSweep = false;
  }
  ctx.abortControllers.delete(tabId);
  ctx.persistAndNotify();
})();
```

- [ ] **Run tests — expect TypeScript-level failures at the call site in runtime.ts**

```bash
cd /Users/pavel/.codex/worktrees/bf24/multichat && npm test 2>&1 | grep -E "error|FAIL|passed" | head -20
```

Expected: compile errors in `runtime.ts` because `runAgentSweepFn` now requires a new argument.

---

## Task 3: Fix `runAgentSweep` and all call sites in runtime.ts

**Files:**

- Modify: `src/core/runtime.ts`

- [ ] **Update `runAgentSweep` signature**

Change from:

```typescript
async runAgentSweep(
  trigger: string,
  tabId = this.workspace.activeTabId,
): Promise<void> {
  await runAgentSweepFn(trigger, tabId, this.buildExecutionContext());
}
```

To:

```typescript
async runAgentSweep(
  trigger: string,
  triggeringMessage: ParticipantMessageEntry | null = null,
  tabId = this.workspace.activeTabId,
): Promise<void> {
  await runAgentSweepFn(trigger, triggeringMessage, tabId, this.buildExecutionContext());
}
```

Add `ParticipantMessageEntry` to the imports at the top of `runtime.ts` if not already imported (it comes from `./types`).

- [ ] **Fix `sendMessage` call site (line ~195)**

Change from:

```typescript
const { entry, triggersSweep } = this.publishMessage(input, tabId);
if (triggersSweep) {
  await this.runAgentSweep('message', tabId);
}
```

To:

```typescript
const { entry, triggersSweep } = this.publishMessage(input, tabId);
if (triggersSweep) {
  await this.runAgentSweep('message', entry, tabId);
}
```

- [ ] **Fix `createAgent` call site (line ~240)**

Change from:

```typescript
void this.runAgentSweep('message', tab.id);
```

To:

```typescript
void this.runAgentSweep('participant-joined', null, tab.id);
```

- [ ] **Fix `removeAgent` call site (line ~307)**

Change from:

```typescript
void this.runAgentSweep('message', tab.id);
```

To:

```typescript
void this.runAgentSweep('participant-left', null, tab.id);
```

- [ ] **Fix `topicChanged` call site (line ~572)**

Change from:

```typescript
void this.runAgentSweep('message', tab.id);
```

To:

```typescript
void this.runAgentSweep('topic-changed', null, tab.id);
```

- [ ] **Run all tests**

```bash
cd /Users/pavel/.codex/worktrees/bf24/multichat && npm test 2>&1 | tail -20
```

Expected: all tests pass, including the new test `'non-message sweep is not restricted by a prior private message'`.

- [ ] **Commit**

```bash
cd /Users/pavel/.codex/worktrees/bf24/multichat
git add src/core/execution.ts src/core/runtime.ts tests/core/runtime/sweeps.test.ts
git commit -m "fix: pass triggeringMessage explicitly at sweep call sites instead of searching timeline"
```

---

## Task 4: Run the full test suite

- [ ] **Run all tests**

```bash
cd /Users/pavel/.codex/worktrees/bf24/multichat && npm test 2>&1 | tail -10
```

Expected output:

```
Test Files  37 passed (37)
     Tests  NNN passed (NNN)
```

If any test fails, read the error and fix before proceeding.

- [ ] **Final commit if any fixups were needed**

```bash
cd /Users/pavel/.codex/worktrees/bf24/multichat
git add -p
git commit -m "fix: address test failures after triggeringMessage refactor"
```
