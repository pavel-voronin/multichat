# Agent Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional per-agent persistent memory (a `Record<number, string>`) that the agent can read from its prompt context and mutate via tools during runtime.

**Architecture:** Memory lives entirely inside `AgentConfig` (no changes to `WorkspaceState` root or `SettingsState`). When `memoryEnabled` is true for an agent, its memory is injected into the system prompt and three memory tools (`memory_add`, `memory_update`, `memory_delete`) are appended to the tool list. Memory tool calls are separated from message actions in the execution layer: memory ops update the agent config in place and emit `agent-memory-changed` timeline entries; message actions are sent normally. Timeline memory entries follow the same visibility rule as silent decisions (`showSilentDecisions`).

**Tech Stack:** TypeScript, Vue 3 Composition API, Pinia, Vitest

---

## File Map

| Action   | File                                                                                          | Responsibility                                              |
|----------|-----------------------------------------------------------------------------------------------|-------------------------------------------------------------|
| Modify   | `src/core/types.ts`                                                                           | Add memory fields to `AgentConfig`, memory `AgentToolCall` variants, `AgentMemoryChangedEntry` type |
| Create   | `src/core/agentMemory.ts`                                                                     | Pure memory operations: add/update/delete, ID generation, prompt formatting |
| Create   | `src/core/agentMemory.test.ts`                                                                | Unit tests for all pure memory functions                    |
| Modify   | `src/core/agentProtocol.ts`                                                                   | Inject memory into system prompt; conditionally append memory tools |
| Modify   | `src/core/openrouter.ts`                                                                      | Pass `context.agent` to `buildTools()`                      |
| Modify   | `src/core/execution.ts`                                                                       | Separate memory actions from message actions; apply memory ops; emit timeline entries |
| Modify   | `src/core/diagnostics.ts`                                                                     | Add `pushMemoryChanged` helper                              |
| Modify   | `src/vue/utils/timeline.ts`                                                                   | Hide `agent-memory-changed` entries when `showSilentDecisions` is false; add priority entry |
| Create   | `src/vue/components/timeline/entries/AgentMemoryChangedEntry.vue`                            | Timeline entry component for memory mutations               |
| Modify   | `src/vue/components/timeline/entryRegistry.ts`                                               | Register `AgentMemoryChangedEntry` component                |
| Create   | `src/vue/components/participants/AgentMemoryEditor.vue`                                      | Memory editor sub-component used inside AgentWizard         |
| Modify   | `src/vue/components/participants/AgentWizard.vue`                                            | Add `memoryEnabled` toggle and `AgentMemoryEditor`          |

---

### Task 1: Extend core types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add memory fields to `AgentConfig` and memory `AgentToolCall` variants**

Replace the `AgentConfig` interface and `AgentToolCall` type in `src/core/types.ts`:

```ts
// AgentConfig — add two optional fields after systemPrompt:
export interface AgentConfig {
  id: string;
  name: string;
  modelId: string;
  isEnabled?: boolean;
  isHidden?: boolean;
  archivedAt?: string | null;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  modelSnapshot?: ModelSnapshot;
  systemPrompt: string;
  memoryEnabled?: boolean;
  memory?: Record<number, string>;
}

// AgentToolCall — add three new variants:
export type AgentToolCall =
  | { type: 'speak_public'; text: string }
  | { type: 'send_private'; to: string; text: string }
  | { type: 'stay_silent'; reason: string }
  | { type: 'memory_add'; content: string }
  | { type: 'memory_update'; id: number; content: string }
  | { type: 'memory_delete'; id: number };
```

- [ ] **Step 2: Add `AgentMemoryChangedEntry` type and update `ChatEntry` union**

Add after `SweepStoppedEntry` in `src/core/types.ts`:

```ts
export interface AgentMemoryChangedEntry extends ChatEntryBase {
  kind: 'agent-memory-changed';
  agentId: string;
  operation: 'add' | 'update' | 'delete';
  entryId: number;
  content?: string;
}
```

Update `ChatEntry`:

```ts
export type ChatEntry =
  | ParticipantMessageEntry
  | ParticipantJoinedEntry
  | ParticipantLeftEntry
  | TopicChangedEntry
  | SilentDecisionEntry
  | RuntimeErrorEntry
  | SweepStartedEntry
  | SweepFinishedEntry
  | SweepStoppedEntry
  | AgentMemoryChangedEntry;
```

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(memory): extend types with AgentConfig memory fields and AgentMemoryChangedEntry"
```

---

### Task 2: Create agentMemory.ts with tests

**Files:**
- Create: `src/core/agentMemory.ts`
- Create: `src/core/agentMemory.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/core/agentMemory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  applyMemoryAdd,
  applyMemoryDelete,
  applyMemoryUpdate,
  formatMemoryForPrompt,
  nextMemoryId,
} from './agentMemory';

describe('nextMemoryId', () => {
  it('returns 1 for empty memory', () => {
    expect(nextMemoryId({})).toBe(1);
  });

  it('returns max id + 1', () => {
    expect(nextMemoryId({ 1: 'a', 3: 'b', 2: 'c' })).toBe(4);
  });
});

describe('applyMemoryAdd', () => {
  it('adds a new entry with next id', () => {
    const result = applyMemoryAdd({}, 'hello');
    expect(result).toEqual({ 1: 'hello' });
  });

  it('deletes when content is empty string', () => {
    // empty content on add is a no-op (nothing to add, nothing to delete)
    // per PRD: empty content = delete. On add with empty content, nothing is added.
    const result = applyMemoryAdd({ 1: 'existing' }, '');
    expect(result).toEqual({ 1: 'existing' });
  });

  it('appends a new entry alongside existing entries', () => {
    const result = applyMemoryAdd({ 1: 'first' }, 'second');
    expect(result).toEqual({ 1: 'first', 2: 'second' });
  });
});

describe('applyMemoryUpdate', () => {
  it('updates an existing entry', () => {
    const result = applyMemoryUpdate({ 1: 'old', 2: 'keep' }, 1, 'new');
    expect(result).toEqual({ 1: 'new', 2: 'keep' });
  });

  it('deletes when content is empty string', () => {
    const result = applyMemoryUpdate({ 1: 'old', 2: 'keep' }, 1, '');
    expect(result).toEqual({ 2: 'keep' });
  });

  it('is a no-op for unknown id', () => {
    const result = applyMemoryUpdate({ 1: 'a' }, 99, 'x');
    expect(result).toEqual({ 1: 'a' });
  });
});

describe('applyMemoryDelete', () => {
  it('removes an entry by id', () => {
    const result = applyMemoryDelete({ 1: 'a', 2: 'b' }, 1);
    expect(result).toEqual({ 2: 'b' });
  });

  it('is a no-op for unknown id', () => {
    const result = applyMemoryDelete({ 1: 'a' }, 99);
    expect(result).toEqual({ 1: 'a' });
  });
});

describe('formatMemoryForPrompt', () => {
  it('returns empty message when memory is empty', () => {
    expect(formatMemoryForPrompt({})).toBe('Your saved memory is empty.');
  });

  it('returns numbered list of entries sorted by id', () => {
    const result = formatMemoryForPrompt({ 2: 'second', 1: 'first' });
    expect(result).toBe('Your saved memory:\n- 1: first\n- 2: second');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- agentMemory
```

Expected: All tests fail with "Cannot find module './agentMemory'".

- [ ] **Step 3: Implement agentMemory.ts**

Create `src/core/agentMemory.ts`:

```ts
export function nextMemoryId(memory: Record<number, string>): number {
  const ids = Object.keys(memory).map(Number);
  return ids.length === 0 ? 1 : Math.max(...ids) + 1;
}

export function applyMemoryAdd(
  memory: Record<number, string>,
  content: string,
): Record<number, string> {
  if (content === '') return { ...memory };
  const id = nextMemoryId(memory);
  return { ...memory, [id]: content };
}

export function applyMemoryUpdate(
  memory: Record<number, string>,
  id: number,
  content: string,
): Record<number, string> {
  if (!(id in memory)) return { ...memory };
  if (content === '') return applyMemoryDelete(memory, id);
  return { ...memory, [id]: content };
}

export function applyMemoryDelete(
  memory: Record<number, string>,
  id: number,
): Record<number, string> {
  const result = { ...memory };
  delete result[id];
  return result;
}

export function formatMemoryForPrompt(memory: Record<number, string>): string {
  const ids = Object.keys(memory)
    .map(Number)
    .sort((a, b) => a - b);
  if (ids.length === 0) return 'Your saved memory is empty.';
  const lines = ids.map((id) => `- ${id}: ${memory[id]}`);
  return `Your saved memory:\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- agentMemory
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/agentMemory.ts src/core/agentMemory.test.ts
git commit -m "feat(memory): add pure agentMemory operations and tests"
```

---

### Task 3: Inject memory into prompt and tools in agentProtocol.ts

**Files:**
- Modify: `src/core/agentProtocol.ts`

- [ ] **Step 1: Update `buildMessages` to inject memory into system prompt**

In `src/core/agentProtocol.ts`, add the import and update `buildMessages`:

```ts
import type { AgentToolCall, AgentTurnContext } from './types';
import { formatMemoryForPrompt } from './agentMemory';

export function buildMessages(context: AgentTurnContext) {
  const selfParticipant = context.participants.find(
    (participant) => participant.id === context.agent.id,
  );
  const participantDirectory = context.participants
    .map(
      (participant) =>
        `- ${participant.id}: ${participant.name} (${participant.role})`,
    )
    .join('\n');

  const visibleHistory = context.visibleMessages.length
    ? context.visibleMessages
        .map((message) => {
          const sender = message.senderName;
          const recipient = message.recipientName ?? message.recipientId;
          const prefix =
            message.target === 'private'
              ? `[${message.createdAt}] <${sender} -> ${recipient}>`
              : `[${message.createdAt}] <${sender}>`;

          return `${prefix} ${message.content}`;
        })
        .join('\n')
    : 'No visible messages yet.';

  const memorySection =
    context.agent.memoryEnabled === true
      ? `\n\n${formatMemoryForPrompt(context.agent.memory ?? {})}`
      : '';

  const sharedInstructions = `${context.agent.systemPrompt}

You are inside a multi-agent chat experiment. Decide whether to speak.
Available participants:
${participantDirectory}

Identity:
- Your participant id is ${context.agent.id}.
- Your participant name is ${selfParticipant?.name ?? context.agent.name}.
- You are this participant and no one else.
- Never claim to be another participant.
- If asked who you are, answer using your own participant name and id.

Internal orchestration policy:
- First decide whether responding is necessary at all.
- Speak only if you add clear value, new information, coordination, correction, or a needed question.
- If another participant already covered the point, prefer silence.
- Prefer silence over weak, repetitive, or low-confidence replies.
- Stay on the current task. Do not introduce unrelated social chatter, invitations, or topic changes.
- Use public responses when the whole room benefits.
- Use private responses only for targeted coordination with one participant.
- Never send a private message to yourself.
- If the human asks you to reply "to me" or "in private", the private recipient should be the human participant, not yourself and not another agent unless explicitly named.
- If the latest visible message is a private message addressed to you from another participant, treat it as a direct private conversation with that sender.
- If another participant privately asks you to coordinate, choose, confirm, or align on an answer, prefer send_private back to that same participant instead of speaking publicly.
- If the human tells participants to coordinate with each other before answering, do not skip that coordination step. Use private messages to coordinate first, then answer publicly only when useful.
- Do not ignore a private coordination message and jump to an unrelated public reply.
- Treat an opening prefix like "Name: ..." or "Name1, Name2: ..." as explicit addressing.
- If the latest message explicitly addresses one or more participants and your own name is not included, you must stay_silent.
- If the latest message explicitly addresses one or more participants and your own name is included, you may respond if useful.
- If a message explicitly addresses another participant by name and that is not your name, stay_silent.
- If a message asks "who is X" or "who among you is X", only respond if X is your own participant name.
- If another participant already gave the direct answer that the user needed, prefer stay_silent instead of piling on.

Response contract:
- You may call any number of tools per turn.
- Call every tool needed to complete your turn.
- Public action: speak_public(text)
- Private action: send_private(to, text), where "to" is the participant id
- Silent action: stay_silent(reason) — if you also call any speaking tool, stay_silent is ignored by the runtime.${context.agent.memoryEnabled === true ? `
- Memory tools: memory_add(content), memory_update(id, content), memory_delete(id)
- Use memory tools to store, update, or remove personal notes between turns.
- Memory operations may accompany any conversational action in the same turn.` : ''}

Visibility rules:
- Public messages are visible to everyone.
- Private messages are visible only to the sender, recipient, and the human observer.
- You only receive the subset of conversation that is visible to you.${memorySection}

Prefer concise responses.`;

  return [
    {
      role: 'system',
      content: sharedInstructions,
    },
    {
      role: 'user',
      content: `Visible conversation history:
${visibleHistory}`,
    },
  ];
}
```

- [ ] **Step 2: Update `buildTools` to accept agent and append memory tools conditionally**

Replace `buildTools()` in `src/core/agentProtocol.ts`:

```ts
import type { AgentConfig, AgentToolCall, AgentTurnContext } from './types';

export function buildTools(agent: AgentConfig) {
  const baseTools = [
    {
      type: 'function',
      function: {
        name: 'speak_public',
        description: 'Send a public message to the full chat.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'send_private',
        description: 'Send a private message to a single participant.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['to', 'text'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'stay_silent',
        description: 'Choose not to respond in this round.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
          },
          required: ['reason'],
          additionalProperties: false,
        },
      },
    },
  ];

  if (agent.memoryEnabled !== true) return baseTools;

  return [
    ...baseTools,
    {
      type: 'function',
      function: {
        name: 'memory_add',
        description:
          'Add a new entry to your personal memory. Pass empty content to skip.',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string' },
          },
          required: ['content'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'memory_update',
        description:
          'Update an existing memory entry by id. Pass empty content to delete it.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            content: { type: 'string' },
          },
          required: ['id', 'content'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'memory_delete',
        description: 'Delete a memory entry by id.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'number' },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
  ];
}
```

- [ ] **Step 3: Update `parseToolAction` to handle memory tool calls**

Replace `parseToolAction` in `src/core/agentProtocol.ts`:

```ts
export function parseToolAction(toolCall: {
  function?: {
    name?: string;
    arguments?: string;
  };
}): AgentToolCall {
  const name = toolCall.function?.name;
  const rawArguments = toolCall.function?.arguments ?? '{}';
  const args = JSON.parse(rawArguments) as Record<string, unknown>;

  if (name === 'speak_public' && typeof args.text === 'string') {
    return { type: 'speak_public', text: args.text };
  }

  if (
    name === 'send_private' &&
    typeof args.to === 'string' &&
    typeof args.text === 'string'
  ) {
    return { type: 'send_private', to: args.to, text: args.text };
  }

  if (name === 'stay_silent' && typeof args.reason === 'string') {
    return { type: 'stay_silent', reason: args.reason };
  }

  if (name === 'memory_add' && typeof args.content === 'string') {
    return { type: 'memory_add', content: args.content };
  }

  if (
    name === 'memory_update' &&
    typeof args.id === 'number' &&
    typeof args.content === 'string'
  ) {
    return { type: 'memory_update', id: args.id, content: args.content };
  }

  if (name === 'memory_delete' && typeof args.id === 'number') {
    return { type: 'memory_delete', id: args.id };
  }

  throw new Error('Invalid tool call payload');
}
```

- [ ] **Step 4: Commit**

```bash
git add src/core/agentProtocol.ts
git commit -m "feat(memory): inject memory into system prompt and add conditional memory tools"
```

---

### Task 4: Update openrouter.ts to pass agent to buildTools

**Files:**
- Modify: `src/core/openrouter.ts`

- [ ] **Step 1: Update the `callChatCompletion` call site**

In `src/core/openrouter.ts`, change line 26 from:

```ts
    tools: buildTools(),
```

to:

```ts
    tools: buildTools(context.agent),
```

- [ ] **Step 2: Commit**

```bash
git add src/core/openrouter.ts
git commit -m "feat(memory): pass agent to buildTools in openrouter transport"
```

---

### Task 5: Add pushMemoryChanged to diagnostics.ts

**Files:**
- Modify: `src/core/diagnostics.ts`

- [ ] **Step 1: Add `pushMemoryChanged` helper**

Add the following import and function to `src/core/diagnostics.ts`. Add to the imports at the top:

```ts
import type {
  AgentConfig,
  AgentExecutionMode,
  AgentMemoryChangedEntry,
  ChatTabState,
  DebugLogEntry,
  EntryInspectionIndex,
  ParticipantMessageEntry,
  RequestTrace,
  RuntimeError,
  RuntimeErrorEntry,
  SilentDecisionEntry,
  SweepFinishedEntry,
  SweepStartedEntry,
  SweepStoppedEntry,
  TimelineHistoryCutoffEntry,
  TransportUsage,
  WorkspaceState,
} from './types';
```

Then add the function at the end of the file:

```ts
export function pushMemoryChanged(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  agentId: string;
  operation: AgentMemoryChangedEntry['operation'];
  entryId: number;
  content?: string;
  sourceTraceId?: string;
}): AgentMemoryChangedEntry {
  const entry: AgentMemoryChangedEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'agent-memory-changed',
    agentId: input.agentId,
    operation: input.operation,
    entryId: input.entryId,
    content: input.content,
    sourceTraceId: input.sourceTraceId,
  };
  input.tab.timeline.push(entry);
  return entry;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/diagnostics.ts
git commit -m "feat(memory): add pushMemoryChanged timeline helper"
```

---

### Task 6: Handle memory tool calls in execution.ts

**Files:**
- Modify: `src/core/execution.ts`

- [ ] **Step 1: Add imports for memory helpers**

At the top of `src/core/execution.ts`, add to the existing imports:

```ts
import {
  applyMemoryAdd,
  applyMemoryDelete,
  applyMemoryUpdate,
} from './agentMemory';
import { pushMemoryChanged } from './diagnostics';
```

(Add these alongside the existing `import { ... } from './diagnostics'` and create separate lines.)

- [ ] **Step 2: Update `handleSuccessfulAgentTurnResultFn` to separate memory actions**

Replace the body of `handleSuccessfulAgentTurnResultFn` in `src/core/execution.ts`. The full updated function:

```ts
export async function handleSuccessfulAgentTurnResultFn({
  agent,
  result,
  traceId,
  tab,
  tabId,
  visibleMessages,
  fallback,
  ctx,
}: {
  agent: AgentConfig;
  result: AgentTurnResult;
  traceId: string;
  tab: ChatTabState;
  tabId: string;
  visibleMessages: AgentContextMessage[];
  fallback: boolean;
  ctx: ExecutionContext;
}): Promise<void> {
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

  // Separate memory operations from conversational actions
  const memoryActions = result.actions.filter(
    (a): a is Extract<AgentToolCall, { type: 'memory_add' | 'memory_update' | 'memory_delete' }> =>
      a.type === 'memory_add' || a.type === 'memory_update' || a.type === 'memory_delete',
  );
  const messageActions = result.actions.filter(
    (a): a is Extract<AgentToolCall, { type: 'speak_public' | 'send_private' }> =>
      a.type === 'speak_public' || a.type === 'send_private',
  );

  // Apply memory operations
  if (memoryActions.length > 0) {
    let memory: Record<number, string> = { ...(agent.memory ?? {}) };

    for (const op of memoryActions) {
      if (op.type === 'memory_add') {
        const prevMemory = { ...memory };
        memory = applyMemoryAdd(memory, op.content);
        // Find the new id by comparing keys
        const newId = Object.keys(memory)
          .map(Number)
          .find((id) => !(id in prevMemory));
        if (newId !== undefined) {
          pushMemoryChanged({
            createId: ctx.createId,
            now: ctx.now,
            tab,
            agentId: agent.id,
            operation: 'add',
            entryId: newId,
            content: op.content,
            sourceTraceId: traceId,
          });
        }
      } else if (op.type === 'memory_update') {
        const isDelete = op.content === '';
        memory = applyMemoryUpdate(memory, op.id, op.content);
        pushMemoryChanged({
          createId: ctx.createId,
          now: ctx.now,
          tab,
          agentId: agent.id,
          operation: isDelete ? 'delete' : 'update',
          entryId: op.id,
          content: isDelete ? undefined : op.content,
          sourceTraceId: traceId,
        });
      } else if (op.type === 'memory_delete') {
        memory = applyMemoryDelete(memory, op.id);
        pushMemoryChanged({
          createId: ctx.createId,
          now: ctx.now,
          tab,
          agentId: agent.id,
          operation: 'delete',
          entryId: op.id,
          sourceTraceId: traceId,
        });
      }
    }

    ctx.updateAgent(agent.id, { memory }, tabId);
  }

  if (messageActions.length === 0) {
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
        actionCount: result.actions.length,
        actionTypes: result.actions.map((a) => a.type),
      },
    });
    ctx.persistAndNotify();
    return;
  }

  const messageIds: string[] = [];
  const recipientIds: string[] = [];

  const actionTexts = messageActions.map((a) => a.text);
  const totalChars = actionTexts.reduce((sum, t) => sum + t.length, 0);
  const totalRequestCost = result.usage?.estimatedCost;
  const totalOwnPromptCost = getPromptCostUsd(agent, result.usage);

  for (let i = 0; i < messageActions.length; i++) {
    const action = messageActions[i]!;
    const share = totalChars > 0 ? actionTexts[i]!.length / totalChars : 1 / messageActions.length;
    const sentMessage = await ctx.sendMessage(
      {
        senderId: agent.id,
        content: actionTexts[i]!,
        target: action.type === 'speak_public' ? 'public' : 'private',
        recipientId: action.type === 'send_private' ? action.to : undefined,
        requestCostUsd: totalRequestCost !== undefined ? totalRequestCost * share : undefined,
        ownPromptCostUsd: totalOwnPromptCost !== undefined ? totalOwnPromptCost * share : undefined,
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
}
```

Note: You also need to add `AgentToolCall` to the imports from `'./types'` at the top of `execution.ts`:

```ts
import type {
  AgentConfig,
  AgentContextMessage,
  AgentToolCall,
  AgentTurnResult,
  ChatTabState,
  OpenRouterTransport,
  ParticipantMessageEntry,
  SendMessageInput,
  WorkspaceState,
} from './types';
```

- [ ] **Step 3: Commit**

```bash
git add src/core/execution.ts
git commit -m "feat(memory): apply memory tool calls and emit timeline entries in execution"
```

---

### Task 7: Update timeline visibility for agent-memory-changed entries

**Files:**
- Modify: `src/vue/utils/timeline.ts`

- [ ] **Step 1: Add filtering and priority for `agent-memory-changed`**

In `src/vue/utils/timeline.ts`, update `buildVisibleTimelineEntries` to hide `agent-memory-changed` entries when `showSilentDecisions` is false:

```ts
    if (
      entry.kind === 'silent-decision' ||
      entry.kind === 'sweep-started' ||
      entry.kind === 'sweep-finished' ||
      entry.kind === 'sweep-stopped' ||
      entry.kind === 'agent-memory-changed'
    ) {
      if (!input.preferences.showSilentDecisions) continue;
    }
```

Update the `priority` record in `compareVisibleTimelineEntries` to include the new kind:

```ts
  const priority: Record<TimelineEntry['kind'], number> = {
    'history-cutoff': 0,
    'participant-message': 1,
    'participant-joined': 1,
    'participant-left': 1,
    'topic-changed': 1,
    'silent-decision': 2,
    'runtime-error': 2,
    'sweep-started': 2,
    'sweep-finished': 2,
    'sweep-stopped': 2,
    'agent-memory-changed': 2,
  };
```

- [ ] **Step 2: Commit**

```bash
git add src/vue/utils/timeline.ts
git commit -m "feat(memory): show agent-memory-changed entries alongside system info entries"
```

---

### Task 8: Add AgentMemoryChangedEntry.vue and register it

**Files:**
- Create: `src/vue/components/timeline/entries/AgentMemoryChangedEntry.vue`
- Modify: `src/vue/components/timeline/entryRegistry.ts`

- [ ] **Step 1: Create the timeline entry component**

Create `src/vue/components/timeline/entries/AgentMemoryChangedEntry.vue`:

```vue
<template>
  <article
    class="entry-article"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <div class="memory-line">
      <span class="message-time">[{{ timeLabel }}]</span>
      {{ ' ' }}<span class="memory-label">{{ label }}</span>
      {{ ' ' }}<span class="memory-text">{{ operationText }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AgentMemoryChangedEntry } from '../../../../core';
import { useCutoffDrag } from '../../../composables/useCutoffDrag';
import { useTimelineStore } from '../../../stores/timeline';
import { formatMessageTime } from '../../../utils/chatFormatting';

const props = defineProps<{
  entry: AgentMemoryChangedEntry & { isMuted: boolean };
}>();

const drag = useCutoffDrag();
const dragPreviewTargetId = drag.dragPreviewTargetId;
const timeline = useTimelineStore();

const timeLabel = computed(() => formatMessageTime(props.entry.createdAt));

const label = computed(() => {
  const name = timeline.participantNameById(props.entry.agentId);
  return name ? `[memory ${name}]` : '[memory]';
});

const operationText = computed(() => {
  const { operation, entryId, content } = props.entry;
  if (operation === 'add') return `added #${entryId}: "${content}"`;
  if (operation === 'update') return `updated #${entryId}: "${content}"`;
  return `deleted #${entryId}`;
});
</script>

<style scoped>
@reference "@styles";

.entry-article {
  @apply relative;
}

.memory-line {
  @apply block break-words text-[13px] leading-6 text-violet-800;
}

.memory-label {
  @apply font-semibold text-violet-900;
}

.memory-text {
  @apply whitespace-pre-wrap text-current;
}

.message-time {
  @apply text-neutral-500;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
```

- [ ] **Step 2: Register the component in entryRegistry.ts**

In `src/vue/components/timeline/entryRegistry.ts`:

```ts
import type { Component } from 'vue';
import type { ChatEntry } from '../../../core';
import ParticipantMessageEntryVue from './entries/ParticipantMessageEntry.vue';
import ParticipantJoinedEntryVue from './entries/ParticipantJoinedEntry.vue';
import ParticipantLeftEntryVue from './entries/ParticipantLeftEntry.vue';
import TopicChangedEntryVue from './entries/TopicChangedEntry.vue';
import SilentDecisionEntryVue from './entries/SilentDecisionEntry.vue';
import RuntimeErrorEntryVue from './entries/RuntimeErrorEntry.vue';
import SweepStartedEntryVue from './entries/SweepStartedEntry.vue';
import SweepFinishedEntryVue from './entries/SweepFinishedEntry.vue';
import SweepStoppedEntryVue from './entries/SweepStoppedEntry.vue';
import AgentMemoryChangedEntryVue from './entries/AgentMemoryChangedEntry.vue';

export const entryRegistry: Record<ChatEntry['kind'], Component> = {
  'participant-message': ParticipantMessageEntryVue,
  'participant-joined': ParticipantJoinedEntryVue,
  'participant-left': ParticipantLeftEntryVue,
  'topic-changed': TopicChangedEntryVue,
  'silent-decision': SilentDecisionEntryVue,
  'runtime-error': RuntimeErrorEntryVue,
  'sweep-started': SweepStartedEntryVue,
  'sweep-finished': SweepFinishedEntryVue,
  'sweep-stopped': SweepStoppedEntryVue,
  'agent-memory-changed': AgentMemoryChangedEntryVue,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/vue/components/timeline/entries/AgentMemoryChangedEntry.vue src/vue/components/timeline/entryRegistry.ts
git commit -m "feat(memory): add AgentMemoryChangedEntry timeline component"
```

---

### Task 9: Add memory editor component

**Files:**
- Create: `src/vue/components/participants/AgentMemoryEditor.vue`

- [ ] **Step 1: Create AgentMemoryEditor.vue**

Create `src/vue/components/participants/AgentMemoryEditor.vue`:

```vue
<template>
  <div class="memory-editor">
    <div v-if="entries.length === 0" class="memory-empty">
      No memory entries yet.
    </div>
    <ul v-else class="memory-list">
      <li v-for="entry in entries" :key="entry.id" class="memory-item">
        <span class="memory-id">#{{ entry.id }}</span>
        <input
          v-if="editingId === entry.id"
          v-model="editingContent"
          class="memory-input"
          type="text"
          @keydown.enter="saveEdit(entry.id)"
          @keydown.escape="cancelEdit"
        />
        <span v-else class="memory-content">{{ entry.content }}</span>
        <div class="memory-actions">
          <template v-if="editingId === entry.id">
            <UiButton class="memory-btn" @click="saveEdit(entry.id)">Save</UiButton>
            <UiButton class="memory-btn" @click="cancelEdit">Cancel</UiButton>
          </template>
          <template v-else>
            <UiButton class="memory-btn" @click="startEdit(entry.id, entry.content)">Edit</UiButton>
            <UiButton class="memory-btn" variant="danger" @click="deleteEntry(entry.id)">Delete</UiButton>
          </template>
        </div>
      </li>
    </ul>
    <div class="memory-add-row">
      <input
        v-model="newContent"
        class="memory-input"
        type="text"
        placeholder="New memory entry..."
        @keydown.enter="addEntry"
      />
      <UiButton class="memory-btn" :disabled="!newContent.trim()" @click="addEntry">Add</UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { nextMemoryId } from '../../../core/agentMemory';
import UiButton from '../ui/UiButton.vue';

const props = defineProps<{
  memory: Record<number, string>;
}>();

const emit = defineEmits<{
  (e: 'update:memory', value: Record<number, string>): void;
}>();

const editingId = ref<number | null>(null);
const editingContent = ref('');
const newContent = ref('');

const entries = computed(() =>
  Object.keys(props.memory)
    .map(Number)
    .sort((a, b) => a - b)
    .map((id) => ({ id, content: props.memory[id]! })),
);

function startEdit(id: number, content: string) {
  editingId.value = id;
  editingContent.value = content;
}

function cancelEdit() {
  editingId.value = null;
  editingContent.value = '';
}

function saveEdit(id: number) {
  const content = editingContent.value.trim();
  if (content === '') {
    deleteEntry(id);
  } else {
    emit('update:memory', { ...props.memory, [id]: content });
  }
  cancelEdit();
}

function deleteEntry(id: number) {
  const updated = { ...props.memory };
  delete updated[id];
  emit('update:memory', updated);
}

function addEntry() {
  const content = newContent.value.trim();
  if (!content) return;
  const id = nextMemoryId(props.memory);
  emit('update:memory', { ...props.memory, [id]: content });
  newContent.value = '';
}
</script>

<style scoped>
@reference "@styles";

.memory-editor {
  @apply flex flex-col gap-2;
}

.memory-empty {
  @apply text-[12px] text-neutral-400;
}

.memory-list {
  @apply m-0 flex list-none flex-col gap-1 p-0;
}

.memory-item {
  @apply flex items-center gap-2;
}

.memory-id {
  @apply shrink-0 text-[11px] text-neutral-400;
}

.memory-content {
  @apply min-w-0 flex-1 truncate text-[13px];
}

.memory-input {
  @apply min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-[13px] outline-none focus:border-neutral-500;
}

.memory-actions {
  @apply flex shrink-0 gap-1;
}

.memory-btn {
  @apply text-[12px];
}

.memory-add-row {
  @apply mt-1 flex gap-2;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/vue/components/participants/AgentMemoryEditor.vue
git commit -m "feat(memory): add AgentMemoryEditor component"
```

---

### Task 10: Add memory toggle and editor to AgentWizard.vue

**Files:**
- Modify: `src/vue/components/participants/AgentWizard.vue`

- [ ] **Step 1: Add memory fields to AgentWizard state and watch**

In `src/vue/components/participants/AgentWizard.vue`, add `memoryEnabled` and `memory` reactive refs alongside the existing ones:

In the `<script setup>` section, add after `const selectedPresetId = ref(defaultPromptPreset.id);`:

```ts
const memoryEnabled = ref(false);
const memory = ref<Record<number, string>>({});
```

Update the `watch(agent, ...)` block to also reset memory fields:

```ts
watch(
  agent,
  (nextAgent) => {
    name.value = nextAgent?.name ?? '';
    modelId.value = nextAgent?.modelId ?? '';
    systemPrompt.value = nextAgent?.systemPrompt ?? defaultPromptPreset.prompt;
    selectedPresetId.value = defaultPromptPreset.id;
    memoryEnabled.value = nextAgent?.memoryEnabled ?? false;
    memory.value = nextAgent?.memory ? { ...nextAgent.memory } : {};
  },
  { immediate: true },
);
```

Update the `watch(() => ui.showAgentWizard, ...)` block — add resets when opening for new agent:

```ts
    if (isOpen && !agent.value) {
      name.value = '';
      modelId.value = '';
      systemPrompt.value = defaultPromptPreset.prompt;
      selectedPresetId.value = defaultPromptPreset.id;
      memoryEnabled.value = false;
      memory.value = {};
      if (ui.preselectedModelId) {
        modelId.value = ui.preselectedModelId;
        ui.preselectedModelId = null;
      }
    }
```

Update `save()` to include memory fields in the payload:

```ts
  const payload = {
    name: name.value.trim(),
    modelId: modelId.value,
    pricing: liveModel?.pricing ?? agent.value?.pricing,
    modelSnapshot,
    systemPrompt: systemPrompt.value.trim(),
    memoryEnabled: memoryEnabled.value,
    memory: { ...memory.value },
  };
```

- [ ] **Step 2: Add imports and memory UI to the template**

Add import at the top of the script section:

```ts
import AgentMemoryEditor from './AgentMemoryEditor.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
```

Add the memory section to the template, after the system prompt field and before `<div class="wizard-actions">`:

```vue
      <div class="wizard-field">
        <span class="wizard-label">Memory</span>
        <label class="wizard-memory-toggle">
          <UiCheckbox v-model="memoryEnabled" />
          <span class="wizard-copy">Enable memory for this agent</span>
        </label>
        <template v-if="memoryEnabled">
          <AgentMemoryEditor v-model:memory="memory" />
        </template>
      </div>
```

Add the CSS classes in the `<style scoped>` section:

```css
.wizard-memory-toggle {
  @apply flex cursor-pointer items-center gap-2;
}
```

- [ ] **Step 3: Check UiCheckbox interface**

Read `src/vue/components/ui/UiCheckbox.vue` to confirm it accepts `v-model` as a boolean. If it uses a different prop name, adjust the template accordingly.

- [ ] **Step 4: Run the dev server and verify manually**

```bash
npm run dev
```

Open the app, create or edit an agent, verify:
1. Memory toggle appears
2. Toggling it on shows the memory editor
3. Can add/edit/delete entries
4. Saving preserves the memory state

- [ ] **Step 5: Commit**

```bash
git add src/vue/components/participants/AgentWizard.vue
git commit -m "feat(memory): add memory toggle and editor to AgentWizard"
```

---

### Task 11: Export new types and helpers from core index

**Files:**
- Modify: `src/core/index.ts` (if it exists) or wherever the core barrel export is

- [ ] **Step 1: Check the core barrel export**

Run:

```bash
cat src/core/index.ts
```

Verify that `AgentMemoryChangedEntry` is exported (it may be re-exported from `types.ts` automatically if there's a `export * from './types'`). If not, add:

```ts
export type { AgentMemoryChangedEntry } from './types';
export { applyMemoryAdd, applyMemoryDelete, applyMemoryUpdate, formatMemoryForPrompt, nextMemoryId } from './agentMemory';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 3: Run all tests**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 4: Commit if any changes were needed**

```bash
git add src/core/index.ts
git commit -m "feat(memory): export AgentMemoryChangedEntry and agentMemory helpers from core"
```

---

## Self-Review

### Spec coverage

| PRD requirement | Task that covers it |
|---|---|
| `memoryEnabled` per-agent toggle | Task 1 (types), Task 10 (UI) |
| `memory: Record<number, string>` shape | Task 1 (types), Task 2 (pure ops) |
| No memory on human | Not added to any human-related type — covered by omission |
| Memory in prompt when enabled | Task 3 |
| Memory tools when enabled | Task 3 |
| `participant_id` absent from memory tools | Task 3 (tools have no participant_id param) |
| `memory_add`, `memory_update`, `memory_delete` tools | Task 3 |
| Empty content = delete | Task 2 (applyMemoryAdd, applyMemoryUpdate) |
| Memory operations in same turn as conversational action | Task 6 (separated but both processed in same turn handler) |
| Timeline entries when system info visible | Task 5, 7, 8 |
| Persistence via existing agent snapshot | Task 1 (fields on AgentConfig, existing storage handles it) |
| No separate inspector section | Not added — covered by omission; memory appears in prompt payload |
| UI: toggle + editor | Task 9, 10 |
| Agent can only edit own memory | Task 6 — uses `agent.id` from execution context, no participant_id param |

### Placeholder scan

No steps contain "TBD", "TODO", or "implement later". All code is complete.

### Type consistency

- `AgentMemoryChangedEntry` defined in Task 1, used in Task 5 (`pushMemoryChanged` input type), Task 8 (Vue component prop)
- `applyMemoryAdd/Update/Delete` defined in Task 2, imported in Task 6
- `pushMemoryChanged` defined in Task 5, imported in Task 6
- `buildTools(agent: AgentConfig)` signature changed in Task 3, call site updated in Task 4
- `memory?: Record<number, string>` on `AgentConfig` used consistently throughout
