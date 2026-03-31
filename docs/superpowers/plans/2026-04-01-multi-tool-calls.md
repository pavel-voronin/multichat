# Multi-Tool Calls Per Agent Turn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow agent turns to emit any number of tool calls per turn, executing all non-silent actions in order and recording them as a single trace with multiple produced messages.

**Architecture:** Replace the singular `action` field with `actions: AgentToolCall[]` throughout the stack. Normalization lives in `agentProtocol.ts` (`parseToolActions`). Execution loops over the effective action list. Diagnostics stores `producedMessageIds[]`. Inspector renders an ordered action list.

**Tech Stack:** TypeScript, Vue 3, Pinia, Vitest

---

## File map

| File | Change |
|------|--------|
| `src/core/types.ts` | `AgentTurnResult.action` → `actions[]`; `RequestTrace.producedMessageId` → `producedMessageIds[]`; `RequestTracePayloads.normalizedActionJson` → `normalizedActionsJson`; `DebugLogEntry` plural fields |
| `src/core/agentProtocol.ts` | Add `parseToolActions()`; update prompt |
| `src/core/openrouter.ts` | Remove `parallel_tool_calls: false`; use `parseToolActions()` |
| `src/core/diagnostics.ts` | Plural `producedMessageIds`; `normalizedActionsJson`; `actions` param |
| `src/core/execution.ts` | Loop over `result.actions`; single debug log per turn |
| `src/vue/stores/inspection.ts` | `currentActionsForTrace`; `usedInEntriesForCurrentEntry` reads `producedMessageIds[]` |
| `src/vue/components/inspection/RequestInspectionDialog.vue` | Output tab: ordered action list |
| `tests/core/openrouter.test.ts` | Fix mocks (`actions:`); add multi-tool + normalization tests |
| `tests/core/runtime/sweeps.test.ts` | Fix all mocks (`actions:` everywhere); add multi-action test |
| `tests/vue/components/multi-agent-chat/inspection.test.ts` | Fix mocks; add multi-action output tab test |
| `README.md` | Update single-action copy |

---

## Task 1: Update core types

**Files:**
- Modify: `src/core/types.ts`

This task updates all type definitions. The TypeScript compilation will fail after this step until production consumers are updated (Tasks 2–5).

- [ ] **Step 1: Update `AgentTurnResult`**

In `src/core/types.ts`, replace lines 379–383:

```ts
export interface AgentTurnResult {
  mode: AgentExecutionMode;
  actions: AgentToolCall[];
  usage?: TransportUsage;
}
```

- [ ] **Step 2: Update `RequestTracePayloads`**

Replace lines 79–84:

```ts
export interface RequestTracePayloads {
  requestInputJson?: unknown;
  responseOutputJson?: unknown;
  normalizedActionsJson?: unknown;
  sanitizedJson?: unknown;
}
```

- [ ] **Step 3: Update `RequestTrace`**

Replace line 114 (`producedMessageId?: string;`) with:

```ts
producedMessageIds: string[];
```

- [ ] **Step 4: Update `DebugLogEntry`**

Replace the `actionType`, `messageId`, `target`, `recipientId`, `content` fields (lines 264–269) with:

```ts
actionCount?: number;
actionTypes?: Array<'speak_public' | 'send_private' | 'stay_silent'>;
messageIds?: string[];
recipientIds?: string[];
```

- [ ] **Step 5: Verify TypeScript now fails (expected)**

Run: `npm run typecheck`
Expected: multiple type errors in `openrouter.ts`, `diagnostics.ts`, `execution.ts`, `inspection.ts`

---

## Task 2: Add `parseToolActions` and update prompt

**Files:**
- Modify: `src/core/agentProtocol.ts`

- [ ] **Step 1: Add `parseToolActions` after the existing `parseToolAction` function**

Append to `src/core/agentProtocol.ts` after line 167:

```ts
export function parseToolActions(
  toolCalls: Array<{
    function?: {
      name?: string;
      arguments?: string;
    };
  }>,
): AgentToolCall[] {
  if (toolCalls.length === 0) {
    throw new Error('Empty tool_calls array');
  }

  const parsed = toolCalls.map((tc) => parseToolAction(tc));

  const effective = parsed.filter((a) => a.type !== 'stay_silent');
  return effective.length > 0 ? effective : [];
}
```

- [ ] **Step 2: Update the response contract in the prompt**

In `src/core/agentProtocol.ts`, replace lines 63–67:

```ts
Response contract:
- You must produce exactly one final action per turn.
- Public action: speak_public(text)
- Private action: send_private(to, text), where "to" is the participant id
- Silent action: stay_silent(reason)
```

With:

```ts
Response contract:
- You may call any number of tools per turn.
- Call every tool needed to complete your turn.
- Public action: speak_public(text)
- Private action: send_private(to, text), where "to" is the participant id
- Silent action: stay_silent(reason) — if you also call any speaking tool, stay_silent is ignored by the runtime.
```

---

## Task 3: Update transport

**Files:**
- Modify: `src/core/openrouter.ts`

- [ ] **Step 1: Update import**

Replace line 7:

```ts
import { buildMessages, buildTools, parseToolActions } from './agentProtocol';
```

- [ ] **Step 2: Remove `parallel_tool_calls: false`**

In `callChatCompletion`, remove line 28 (`parallel_tool_calls: false,`) from the request payload object. The object becomes:

```ts
const requestPayload = {
  model: context.agent.modelId,
  messages: buildMessages(context),
  tools: buildTools(),
  tool_choice: 'required',
};
```

- [ ] **Step 3: Replace single-call parse with `parseToolActions`**

Replace line 82 (`const action = parseToolAction(message.tool_calls?.[0] ?? {});`) and the return statement (lines 84–101) with:

```ts
  const toolCalls = message.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    throw new Error('OpenRouter returned no tool calls');
  }

  const actions = parseToolActions(toolCalls);

  return {
    mode: 'tools',
    actions,
    usage: {
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      totalTokens: payload.usage?.total_tokens,
      estimatedCost: payload.usage?.cost,
      requestPayloadJson: requestPayload,
      responsePayloadJson: payload,
      transportMeta: {
        provider: 'openrouter',
        modelId: context.agent.modelId,
        executionMode: 'tools',
      },
    },
  };
```

---

## Task 4: Update diagnostics

**Files:**
- Modify: `src/core/diagnostics.ts`

- [ ] **Step 1: Update `createRequestTrace` — initialize `producedMessageIds`**

In `createRequestTrace`, replace line 45 (`producedMessageId: undefined,`) with:

```ts
producedMessageIds: [],
```

- [ ] **Step 2: Update `completeRequestTrace` — accept `actions` param**

Replace the function signature parameter `action?: unknown` (line 80) with `actions?: unknown`. Replace the body lines 108–110:

```ts
  if (input.actions) {
    trace.payloads.normalizedActionsJson = input.actions;
  }
```

- [ ] **Step 3: Update `attachProducedMessageToTrace` — push to array**

Replace lines 129–133:

```ts
  trace.producedMessageIds.push(messageId);
  trace.downstreamMessageIds.push(messageId);
  trace.links.push({ kind: 'produced-message', messageId });
  const index = getEntryInspectionIndexEntry(messageId, tab);
  index.sourceTraceId = traceId;
```

---

## Task 5: Update execution

**Files:**
- Modify: `src/core/execution.ts`

- [ ] **Step 1: Replace the entire `handleSuccessfulAgentTurnResultFn` body**

Replace lines 127–210 (the function body after the parameter destructuring) with:

```ts
  markVisibleContextProcessed(
    agent.id,
    tab,
    lastProcessedKeysForTab(tab.id, ctx),
  );
  applyUsage(agent.id, result.usage, tab);
  applyDownstreamPromptCost(agent, visibleMessages, result.usage, tab);
  completeRequestTrace({
    now: ctx.now,
    traceId,
    tab,
    status: 'succeeded',
    usage: result.usage,
    actions: result.actions,
    promptCostUsd: getPromptCostUsd(agent, result.usage),
  });

  if (result.actions.length === 0) {
    const requestCostUsd = result.usage?.estimatedCost;
    const ownPromptCostUsd = getPromptCostUsd(agent, result.usage);
    pushSilentDecision({
      createId: ctx.createId,
      now: ctx.now,
      tab,
      agentId: agent.id,
      reason: 'stay_silent',
      sourceTraceId: traceId,
      requestCostUsd,
      ownPromptCostUsd,
      costUsd: requestCostUsd,
    });
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'turn-result',
        sweep: tab.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        mode: result.mode,
        fallback,
        actionCount: 0,
        actionTypes: [],
      },
    });
    ctx.persistAndNotify();
    return;
  }

  const messageIds: string[] = [];
  const recipientIds: string[] = [];

  for (const action of result.actions) {
    const sentMessage = await ctx.sendMessage(
      {
        senderId: agent.id,
        content: action.text,
        target: action.type === 'speak_public' ? 'public' : 'private',
        recipientId: action.type === 'send_private' ? action.to : undefined,
        requestCostUsd: result.usage?.estimatedCost,
        ownPromptCostUsd: getPromptCostUsd(agent, result.usage),
        createdInSweep: tab.execution.sweepCount,
        sourceTraceId: traceId,
        triggerSweep: false,
      },
      tabId,
    );
    attachProducedMessageToTrace(traceId, sentMessage.id, tab);
    messageIds.push(sentMessage.id);
    if (action.type === 'send_private') {
      recipientIds.push(action.to);
    }
  }

  pushDebugLog({
    now: ctx.now,
    workspace: ctx.workspace,
    payload: {
      kind: 'turn-result',
      sweep: tab.execution.sweepCount,
      agentId: agent.id,
      agentName: agent.name,
      mode: result.mode,
      fallback,
      actionCount: result.actions.length,
      actionTypes: result.actions.map((a) => a.type),
      messageIds,
      recipientIds: recipientIds.length > 0 ? recipientIds : undefined,
    },
  });
  tab.execution.queuedSweep = true;
```

Note: `action.text` requires that both `speak_public` and `send_private` have a `text` field — which they do per the `AgentToolCall` union type.

- [ ] **Step 2: Run typecheck — expect remaining failures only in test files**

Run: `npm run typecheck`
Expected: remaining errors only in `tests/` files (sweeps.test.ts, openrouter.test.ts, inspection.test.ts)

---

## Task 6: Fix existing test mocks

**Files:**
- Modify: `tests/core/runtime/sweeps.test.ts`
- Modify: `tests/core/openrouter.test.ts`
- Modify: `tests/vue/components/multi-agent-chat/inspection.test.ts`

- [ ] **Step 1: Fix `sweeps.test.ts` — replace all `action:` with `actions:`**

Every `return { mode: 'tools', action: {...} }` in the file becomes `return { mode: 'tools', actions: [{...}] }`. There are approximately 12 occurrences. Use search-replace:

Find: `action: { type: 'stay_silent', reason: 'ordered' }`
Replace: `actions: [{ type: 'stay_silent', reason: 'ordered' }]`

Find: `action: { type: 'stay_silent', reason: 'done' }`
Replace: `actions: [{ type: 'stay_silent', reason: 'done' }]`

Find: `action: { type: 'stay_silent', reason: 'no input' }`
Replace: `actions: [{ type: 'stay_silent', reason: 'no input' }]`

Find: `action: { type: 'stay_silent', reason: 'not addressed' }`
Replace: `actions: [{ type: 'stay_silent', reason: 'not addressed' }]`

Find: `action: { type: 'stay_silent', reason: 'test' }`
Replace: `actions: [{ type: 'stay_silent', reason: 'test' }]`

Find: `action: { type: 'stay_silent', reason: 'late' }`
Replace: `actions: [{ type: 'stay_silent', reason: 'late' }]`

Find: `action: { type: 'speak_public', text: 'reply from alpha' }`
Replace: `actions: [{ type: 'speak_public', text: 'reply from alpha' }]`

Find: `action: { type: 'speak_public', text: 'reply from beta' }`
Replace: `actions: [{ type: 'speak_public', text: 'reply from beta' }]`

Find: `action: { type: 'speak_public', text: 'follow-up from alpha' }`
Replace: `actions: [{ type: 'speak_public', text: 'follow-up from alpha' }]`

Find: `action: { type: 'speak_public', text: 'reply from alpha' }`
(already done above)

Find: `action: { type: 'speak_public', text: 'need more detail' }`
Replace: `actions: [{ type: 'speak_public', text: 'need more detail' }]`

Find: `action: { type: 'speak_public', text: 'answer once' }`
Replace: `actions: [{ type: 'speak_public', text: 'answer once' }]`

Find: `action: { type: 'speak_public', text: 'from beta' }`
Replace: `actions: [{ type: 'speak_public', text: 'from beta' }]`

Find: `action: { type: 'send_private', text: 'hey beta', to: betaId }`
Replace: `actions: [{ type: 'send_private', text: 'hey beta', to: betaId }]`

Find: `action: { type: 'send_private', text: 'just for you', to: alphaId }`
Replace: `actions: [{ type: 'send_private', text: 'just for you', to: alphaId }]`

Find: `action: { type: 'speak_public', text: 'Beta: your turn' }`
Replace: `actions: [{ type: 'speak_public', text: 'Beta: your turn' }]`

Also fix the `AgentTurnResult` promise in the abort test (line 333):
```ts
resolve({
  mode: 'tools',
  actions: [{ type: 'stay_silent', reason: 'late' }],
}),
```

- [ ] **Step 2: Fix `openrouter.test.ts` — update mock responses (no `action:` references in this file's mocks; it tests the prompt text)**

This test file has no `action:` return shapes — it mocks HTTP responses, not transport results. No changes needed for type compliance. Verify by reading — the mock at line 153 returns a raw HTTP response with `tool_calls`, which the transport parses.

- [ ] **Step 3: Fix `inspection.test.ts` — replace all `action:` with `actions:`**

Find all `action: { type: 'speak_public', text: 'agent reply' }` occurrences (4 times in the file at lines 102, 144, 197, 241, 339):
Replace each with: `actions: [{ type: 'speak_public', text: 'agent reply' }]`

- [ ] **Step 4: Run typecheck — expect clean**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 5: Run tests — expect all pass**

Run: `npm test`
Expected: all tests pass (same behavior as before)

- [ ] **Step 6: Commit type refactoring**

```bash
git add src/core/types.ts src/core/agentProtocol.ts src/core/openrouter.ts \
  src/core/diagnostics.ts src/core/execution.ts \
  tests/core/openrouter.test.ts tests/core/runtime/sweeps.test.ts \
  tests/vue/components/multi-agent-chat/inspection.test.ts
git commit -m "refactor: replace singular action with actions[] throughout stack"
```

---

## Task 7: Add new tests for multi-tool parsing and normalization

**Files:**
- Modify: `tests/core/openrouter.test.ts`

- [ ] **Step 1: Write test — multiple tool calls parsed in order**

Add after the existing `describe('OpenRouterHttpTransport', ...)` block:

```ts
describe('parseToolActions (multi-tool support)', () => {
  it('returns both actions when model emits speak_public and send_private', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: 'speak_public',
                    arguments: JSON.stringify({ text: 'hello everyone' }),
                  },
                },
                {
                  function: {
                    name: 'send_private',
                    arguments: JSON.stringify({ to: 'alice', text: 'just you' }),
                  },
                },
              ],
            },
          },
        ],
      }),
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const transport = new OpenRouterHttpTransport();
    const context: AgentTurnContext = {
      agent: { id: 'a1', name: 'Agent', modelId: 'model', systemPrompt: '' },
      participants: [{ id: 'a1', name: 'Agent', role: 'agent' }],
      visibleMessages: [],
    };
    const result = await transport.runAgentTurn({ apiKey: 'key', context });

    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toEqual({ type: 'speak_public', text: 'hello everyone' });
    expect(result.actions[1]).toEqual({ type: 'send_private', to: 'alice', text: 'just you' });
  });

  it('drops stay_silent when any speaking tool is also returned', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: 'speak_public',
                    arguments: JSON.stringify({ text: 'saying something' }),
                  },
                },
                {
                  function: {
                    name: 'stay_silent',
                    arguments: JSON.stringify({ reason: 'contradiction' }),
                  },
                },
              ],
            },
          },
        ],
      }),
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const transport = new OpenRouterHttpTransport();
    const context: AgentTurnContext = {
      agent: { id: 'a1', name: 'Agent', modelId: 'model', systemPrompt: '' },
      participants: [{ id: 'a1', name: 'Agent', role: 'agent' }],
      visibleMessages: [],
    };
    const result = await transport.runAgentTurn({ apiKey: 'key', context });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ type: 'speak_public', text: 'saying something' });
  });

  it('returns empty actions when all tool calls are stay_silent', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: 'stay_silent',
                    arguments: JSON.stringify({ reason: 'nothing to add' }),
                  },
                },
                {
                  function: {
                    name: 'stay_silent',
                    arguments: JSON.stringify({ reason: 'still nothing' }),
                  },
                },
              ],
            },
          },
        ],
      }),
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const transport = new OpenRouterHttpTransport();
    const context: AgentTurnContext = {
      agent: { id: 'a1', name: 'Agent', modelId: 'model', systemPrompt: '' },
      participants: [{ id: 'a1', name: 'Agent', role: 'agent' }],
      visibleMessages: [],
    };
    const result = await transport.runAgentTurn({ apiKey: 'key', context });

    expect(result.actions).toHaveLength(0);
  });

  it('does not deduplicate identical tool calls', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: 'speak_public',
                    arguments: JSON.stringify({ text: 'repeat' }),
                  },
                },
                {
                  function: {
                    name: 'speak_public',
                    arguments: JSON.stringify({ text: 'repeat' }),
                  },
                },
              ],
            },
          },
        ],
      }),
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const transport = new OpenRouterHttpTransport();
    const context: AgentTurnContext = {
      agent: { id: 'a1', name: 'Agent', modelId: 'model', systemPrompt: '' },
      participants: [{ id: 'a1', name: 'Agent', role: 'agent' }],
      visibleMessages: [],
    };
    const result = await transport.runAgentTurn({ apiKey: 'key', context });

    expect(result.actions).toHaveLength(2);
  });
});
```

Also add the missing `afterEach` cleanup for these tests — they use `vi.stubGlobal('fetch', ...)` but the new describe block has no `afterEach`. Add before the tests:

```ts
const originalFetch2 = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch2; });
```

- [ ] **Step 2: Run tests — expect new tests pass**

Run: `npm test tests/core/openrouter.test.ts`
Expected: all pass (implementation already done in Task 3)

- [ ] **Step 3: Also verify the existing prompt test still passes**

The test at line 231 checks that the prompt contains private coordination instructions. Also verify it no longer contains "exactly one final action" language:

Add to the existing `'instructs agents to answer private coordination privately'` test:

```ts
expect(prompt).not.toContain('exactly one final action per turn');
expect(prompt).toContain('You may call any number of tools per turn');
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add tests/core/openrouter.test.ts
git commit -m "test: add multi-tool parsing and normalization tests"
```

---

## Task 8: Add multi-action execution sweep test

**Files:**
- Modify: `tests/core/runtime/sweeps.test.ts`

- [ ] **Step 1: Add multi-action turn test**

Add after the last test in `describe('MultiChatRuntime sweeps', ...)`:

```ts
it('produces two messages when one agent turn returns speak_public and send_private', async () => {
  let betaId = '';
  const runtime = createRuntime({
    transport: createTransport(async (agentId) => {
      if (agentId === betaId) {
        const visible = runtime.getVisibleMessagesForAgent(agentId);
        if (!visible.some((m) => m.senderId === betaId)) {
          return {
            mode: 'tools',
            actions: [
              { type: 'speak_public', text: 'public reply' },
              { type: 'send_private', to: 'human', text: 'private note' },
            ],
          };
        }
      }
      return {
        mode: 'tools',
        actions: [{ type: 'stay_silent', reason: 'done' }],
      };
    }),
  });

  runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: 'prompt' });
  runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
  runtime.updateSettings({ openRouterApiKey: 'test-key' });
  betaId = runtime.getState().agents.find((a) => a.name === 'Beta')!.id;

  await runtime.sendMessage({
    senderId: 'human',
    content: 'go',
    target: 'public',
  });

  const messages = timelineMessages(runtime);
  const betaMessages = messages.filter((m) => m.authorId === betaId);
  expect(betaMessages).toHaveLength(2);
  expect(betaMessages[0]!.target).toBe('public');
  expect(betaMessages[0]!.content).toBe('public reply');
  expect(betaMessages[1]!.target).toBe('private');
  expect(betaMessages[1]!.content).toBe('private note');

  // Both messages share the same sourceTraceId
  expect(betaMessages[0]!.sourceTraceId).toBeDefined();
  expect(betaMessages[0]!.sourceTraceId).toBe(betaMessages[1]!.sourceTraceId);
});
```

- [ ] **Step 2: Run tests — expect new test passes**

Run: `npm test tests/core/runtime/sweeps.test.ts`
Expected: all pass including the new test

- [ ] **Step 3: Commit**

```bash
git add tests/core/runtime/sweeps.test.ts
git commit -m "test: add multi-action turn produces multiple messages test"
```

---

## Task 9: Update inspection store, UI, and tests

**Files:**
- Modify: `src/vue/stores/inspection.ts`
- Modify: `src/vue/components/inspection/RequestInspectionDialog.vue`
- Modify: `tests/vue/components/multi-agent-chat/inspection.test.ts`

### Store

- [ ] **Step 1: Rename `currentActionForTrace` → `currentActionsForTrace`**

In `src/vue/stores/inspection.ts`, replace lines 59–63:

```ts
const currentActionsForTrace = computed<AgentToolCall[]>(() => {
  const payload = traceForCurrentEntry.value?.payloads.normalizedActionsJson;
  if (!payload || !Array.isArray(payload)) return [];
  return payload as AgentToolCall[];
});
```

- [ ] **Step 2: Update `usedInEntriesForCurrentEntry` to read `producedMessageIds[]`**

Replace lines 65–81:

```ts
const usedInEntriesForCurrentEntry = computed<ParticipantMessageEntry[]>(
  () => {
    const entryId = currentInspectedEntry.value?.id;
    if (!entryId) return [];
    const index = diagnostics.value.entryInspectionIndex[entryId];
    if (!index) return [];
    return index.downstreamTraceIds
      .map((traceId) => diagnostics.value.requestTraces[traceId])
      .filter(Boolean)
      .flatMap((trace) =>
        trace.producedMessageIds
          .map((id) => findParticipantEntryById(state.value, id))
          .filter((e): e is ParticipantMessageEntry => e !== null),
      );
  },
);
```

- [ ] **Step 3: Update the return object**

In the `return` statement, replace `currentActionForTrace` with `currentActionsForTrace`.

### Vue component

- [ ] **Step 4: Update the script section of `RequestInspectionDialog.vue`**

In the `<script setup>` block, replace the destructured `currentActionForTrace: action` with `currentActionsForTrace: actions`:

```ts
const {
  currentInspectedEntry: message,
  traceForCurrentEntry: trace,
  agentForCurrentEntry: agent,
  currentActionsForTrace: actions,
  usedInEntriesForCurrentEntry: usedInMessages,
} = storeToRefs(inspection);
```

- [ ] **Step 5: Replace `actionDetailLabel` computed with `actionLabels`**

Replace lines 288–298:

```ts
const actionLabels = computed((): string[] => {
  return actions.value.map((a) => {
    switch (a.type) {
      case 'speak_public':
        return 'Published to public chat';
      case 'send_private':
        return `Sent privately to ${inspection.participantName(a.to)}`;
      case 'stay_silent':
        return `Stayed silent: ${a.reason}`;
    }
  });
});
```

- [ ] **Step 6: Update the output tab template**

In the `<template>` block, replace lines 156–159:

```html
<div class="inspection-block">
  <p class="inspection-field-label">Action</p>
  <p class="inspection-field-value">{{ actionDetailLabel }}</p>
</div>
```

With:

```html
<div class="inspection-block">
  <p class="inspection-field-label">Actions</p>
  <div v-if="actions.length" class="inspection-action-list">
    <p
      v-for="(label, i) in actionLabels"
      :key="i"
      class="inspection-field-value"
    >{{ i + 1 }}. {{ label }}</p>
  </div>
  <p v-else class="inspection-na">No messages produced</p>
</div>
```

- [ ] **Step 7: Add the `inspection-action-list` style**

In the `<style scoped>` block, add after `.inspection-block`:

```css
.inspection-action-list {
  @apply grid gap-0.5;
}
```

### Tests

- [ ] **Step 8: Update existing inspection test at line 228 (`shows speak_public action in Output tab`)**

The test already triggers the Output tab and checks for `'Published to public chat'`. This text is still correct (it's produced by `actionLabels`). No change needed.

- [ ] **Step 9: Add new test for multi-action output tab**

Add after the `'shows speak_public action in Output tab'` test:

```ts
it('shows both actions when a single turn emits speak_public and send_private', async () => {
  const transport: OpenRouterTransport = {
    async listModels() {
      return [
        {
          id: 'model-a:free',
          name: 'Model A Free',
          context_length: 128000,
          supported_parameters: ['tools'],
        },
      ];
    },
    async runAgentTurn() {
      return {
        mode: 'tools',
        actions: [
          { type: 'speak_public', text: 'public part' },
          { type: 'send_private', to: 'human', text: 'private part' },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          requestCostUsd: 0.001,
        },
      };
    },
  };

  const runtime = createRuntime({ transport });
  await runtime.sendMessage({
    senderId: 'human',
    content: 'please answer',
    target: 'public',
  });

  const wrapper = mountChat(runtime);
  // Find and click the first agent message (public part)
  const triggers = wrapper.findAll('.chat-line-time-active');
  // triggers[0]=human message, triggers[1]=public agent message
  await triggers[1]!.trigger('click');

  const resultTab = Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'Output',
  );
  resultTab!.click();
  await wrapper.vm.$nextTick();

  expect(document.body.textContent).toContain('1. Published to public chat');
  expect(document.body.textContent).toContain('2. Sent privately to');
});
```

- [ ] **Step 10: Run typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 11: Run tests — all pass**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 12: Commit**

```bash
git add src/vue/stores/inspection.ts \
  src/vue/components/inspection/RequestInspectionDialog.vue \
  tests/vue/components/multi-agent-chat/inspection.test.ts
git commit -m "feat: update inspector output tab for multi-action turns"
```

---

## Task 10: Update README and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update agent behavior description**

Find line 15 in README.md (the line that reads):

```
Version 1 keeps agent execution deterministic and sequential. Agents decide whether to speak, send a private message, or stay silent. Tool calling is the primary response protocol, with JSON fallback reserved for models that do not support tools.
```

Replace with:

```
Version 1 keeps agent execution deterministic and sequential. Agents may produce any number of tool calls per turn — speaking publicly, sending private messages, or staying silent. When both speaking and silent actions are returned in one turn, silent calls are ignored. Tool calling is the primary response protocol, with JSON fallback reserved for models that do not support tools.
```

- [ ] **Step 2: Final full test run**

Run: `npm test`
Expected: all tests pass, no failures

Run: `npm run typecheck`
Expected: no type errors

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: update README to reflect multi-action turn behavior"
```

---

## Self-review checklist

- [x] **Spec coverage**: All acceptance criteria covered — transport (Task 3), normalization (Tasks 2–3), execution loop (Task 5), silent-only turn (Task 5), multiple producedMessageIds (Task 4), inspector multi-action list (Task 9), sweep continuation unchanged (no changes to sweep loop), single-tool backward compat (preserved by wrapping in `[...]` in tests)
- [x] **No placeholders**: All steps contain actual code
- [x] **Type consistency**: `actions: AgentToolCall[]` used throughout; `parseToolActions` defined in Task 2 and used in Task 3; `producedMessageIds: string[]` initialized in Task 4 and read in Task 9; `currentActionsForTrace` defined in Task 9 store step and destructured in Task 9 component step
- [x] **README gap**: Addressed in Task 10
- [x] **Prompt assertion test**: Updated in Task 7 Step 3 to check for new multi-tool language
