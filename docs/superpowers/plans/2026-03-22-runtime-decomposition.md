# runtime.ts Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/core/runtime.ts` (1726 lines) into 5 focused modules without changing the public API of `MultiChatRuntime` or existing tests.

**Architecture:** Extract pure/near-pure functions into new files following the existing `diagnostics.ts`/`workspace.ts` pattern. `MultiChatRuntime` becomes a thin orchestrator that delegates to module functions and handles persistence/notification.

**Tech Stack:** TypeScript, Vitest (test runner: `npm test` = `vitest run`)

---

## Baseline

Before starting: **all 46 core runtime tests must pass.** Pre-existing failures in `tests/vue/` are unrelated — ignore them.

Run: `npm test -- tests/core`
Expected: `Tests 46 passed (46)`

---

## File Map

| File | Action | Lines (approx) |
|------|--------|----------------|
| `src/core/context-routing.ts` | **Create** | ~160 |
| `src/core/accounting.ts` | **Create** | ~85 |
| `src/core/traces.ts` | **Create** | ~120 |
| `src/core/messaging.ts` | **Create** | ~100 |
| `src/core/execution.ts` | **Create** | ~460 |
| `src/core/runtime.ts` | **Modify** (remove extracted code, add imports+delegation) | ~900 |

Each task: create one module → update `runtime.ts` → green tests → commit.

---

## Task 1: Extract `context-routing.ts`

**Files:**
- Create: `src/core/context-routing.ts`
- Modify: `src/core/runtime.ts`

- [ ] **Step 1: Confirm baseline passes**

```bash
npm test -- tests/core
```
Expected: `Tests 46 passed (46)`

- [ ] **Step 2: Create `src/core/context-routing.ts`**

```ts
import type {
  AgentConfig,
  AgentContextCutoff,
  AgentContextMessage,
  ChatMessage,
  ChatTabState,
  ContextCutoffAnchor,
} from './types';
import {
  getActiveManualCutoffIndex,
  getTimelineMessages,
} from './diagnostics';
import {
  getMessageSenderId,
  isSystemMessage,
  SYSTEM_AUTHOR_NAME,
} from './messages';
import { DEFAULT_HUMAN } from './workspace';

export function getContextWindowMessages(tab: ChatTabState): ChatMessage[] {
  const cutoffIndex = getActiveManualCutoffIndex(tab);
  if (cutoffIndex === null) {
    return getTimelineMessages(tab);
  }
  return tab.timeline
    .slice(cutoffIndex + 1)
    .filter((entry) => entry.kind === 'message')
    .map((entry) => entry.message);
}

export function isMessageVisibleToAgent(
  message: ChatMessage,
  agentId: string,
): boolean {
  if (message.target === 'public') return true;
  return (
    getMessageSenderId(message) === agentId ||
    message.recipientId === agentId
  );
}

export function isMessageVisibleToParticipant(
  message: ChatMessage,
  participantId: string,
): boolean {
  if (message.target === 'public') return true;
  if (participantId === DEFAULT_HUMAN.id) return true;
  return (
    getMessageSenderId(message) === participantId ||
    message.recipientId === participantId
  );
}

export function getVisibleMessagesForAgent(
  agentId: string,
  tab: ChatTabState,
  maxContextMessages: number,
): AgentContextMessage[] {
  const contextWindowSize = tab.contextWindowSize ?? maxContextMessages;
  const visibleMessages = getContextWindowMessages(tab)
    .slice(-contextWindowSize)
    .filter((message) => isMessageVisibleToAgent(message, agentId));

  return visibleMessages.slice(-contextWindowSize).map((message) => {
    const senderId = getMessageSenderId(message);
    const sender = tab.participants.find((p) => p.id === senderId);
    const recipient = tab.participants.find(
      (p) => p.id === message.recipientId,
    );
    return {
      id: message.id,
      authorType: message.author.type,
      senderId: senderId ?? undefined,
      senderName: isSystemMessage(message)
        ? SYSTEM_AUTHOR_NAME
        : (sender?.name ?? senderId ?? ''),
      target: message.target,
      recipientId: message.recipientId,
      recipientName: recipient?.name,
      content: message.content,
      createdAt: message.createdAt,
    };
  });
}

export function getNonSelfVisibleMessageIds(
  agentId: string,
  tab: ChatTabState,
  maxContextMessages: number,
): string[] {
  return getVisibleMessagesForAgent(agentId, tab, maxContextMessages)
    .filter((message) => message.senderId !== agentId)
    .map((message) => message.id);
}

export function getVisibleContextKey(
  agentId: string,
  tab: ChatTabState,
  maxContextMessages: number,
): string {
  return getNonSelfVisibleMessageIds(agentId, tab, maxContextMessages).join('|');
}

export function hasNewVisibleInputForAgent(
  agentId: string,
  tab: ChatTabState,
  processedKeys: Map<string, string>,
  maxContextMessages: number,
): boolean {
  if (!processedKeys.has(agentId)) return true;
  const previousIds = new Set(
    (processedKeys.get(agentId) ?? '').split('|').filter(Boolean),
  );
  const nextIds = getNonSelfVisibleMessageIds(agentId, tab, maxContextMessages);
  return nextIds.some((messageId) => !previousIds.has(messageId));
}

export function markVisibleContextProcessed(
  agentId: string,
  tab: ChatTabState,
  processedKeys: Map<string, string>,
  maxContextMessages: number,
): void {
  processedKeys.set(agentId, getVisibleContextKey(agentId, tab, maxContextMessages));
}

export function getTriggeringMessageIds(
  previousContextKey: string,
  nextVisibleMessageIds: string[],
): string[] {
  const previousMessageIds = new Set(
    previousContextKey ? previousContextKey.split('|').filter(Boolean) : [],
  );
  return nextVisibleMessageIds.filter(
    (messageId) => !previousMessageIds.has(messageId),
  );
}

export function getActiveAgents(tab: ChatTabState): AgentConfig[] {
  return tab.agents.filter(
    (agent) => agent.isEnabled !== false && agent.isHidden !== true,
  );
}

export function getAgentContextCutoffs(
  tab: ChatTabState,
  maxContextMessages: number,
): AgentContextCutoff[] {
  const activeAgents = getActiveAgents(tab);
  const contextWindowSize = tab.contextWindowSize ?? maxContextMessages;
  const contextMessages = getContextWindowMessages(tab).slice(-contextWindowSize);
  const anchor = contextMessages[0]
    ? ({ kind: 'before-message' as const, messageId: contextMessages[0].id })
    : ({ kind: getTimelineMessages(tab).length ? 'end' : 'start' } as ContextCutoffAnchor);

  return [
    {
      anchor,
      agentIds: activeAgents.map((agent) => agent.id),
      agentNames: activeAgents.map((agent) => agent.name),
    },
  ];
}
```


- [ ] **Step 3: Update `runtime.ts` — add import, replace methods with delegating calls**

Add to imports at top of `runtime.ts`:
```ts
import {
  getActiveAgents,
  getAgentContextCutoffs,
  getContextWindowMessages,
  getNonSelfVisibleMessageIds,
  getTriggeringMessageIds,
  getVisibleContextKey,
  getVisibleMessagesForAgent as getVisibleMessagesForAgentFn,
  hasNewVisibleInputForAgent,
  isMessageVisibleToAgent as isMessageVisibleToAgentFn,
  isMessageVisibleToParticipant as isMessageVisibleToParticipantFn,
  markVisibleContextProcessed,
} from './context-routing';
```

Replace the bodies of these methods/properties in `runtime.ts` (keep the method signatures, replace implementation with delegation):

```ts
getVisibleMessagesForAgent(
  agentId: string,
  tabId = this.workspace.activeTabId,
): AgentContextMessage[] {
  return getVisibleMessagesForAgentFn(
    agentId,
    this.requireTab(tabId),
    this.maxContextMessages,
  );
}

getAgentContextCutoffs(tabId = this.workspace.activeTabId): AgentContextCutoff[] {
  return getAgentContextCutoffs(this.requireTab(tabId), this.maxContextMessages);
}

isMessageVisibleToAgent(message: ChatMessage, agentId: string): boolean {
  return isMessageVisibleToAgentFn(message, agentId);
}

isMessageVisibleToParticipant(message: ChatMessage, participantId: string): boolean {
  return isMessageVisibleToParticipantFn(message, participantId);
}
```

Replace the private methods with delegating private methods:
```ts
private getContextWindowMessages(tab: ChatTabState): ChatMessage[] {
  return getContextWindowMessages(tab);
}

private getNonSelfVisibleMessageIds(agentId: string, tab: ChatTabState): string[] {
  return getNonSelfVisibleMessageIds(agentId, tab, this.maxContextMessages);
}

private getVisibleContextKey(agentId: string, tab: ChatTabState): string {
  return getVisibleContextKey(agentId, tab, this.maxContextMessages);
}

private hasNewVisibleInputForAgent(agentId: string, tab: ChatTabState): boolean {
  return hasNewVisibleInputForAgent(
    agentId,
    tab,
    this.lastProcessedKeysForTab(tab.id),
    this.maxContextMessages,
  );
}

private markVisibleContextProcessed(agentId: string, tab: ChatTabState): void {
  markVisibleContextProcessed(
    agentId,
    tab,
    this.lastProcessedKeysForTab(tab.id),
    this.maxContextMessages,
  );
}

private getTriggeringMessageIds(
  previousContextKey: string,
  nextVisibleMessageIds: string[],
): string[] {
  return getTriggeringMessageIds(previousContextKey, nextVisibleMessageIds);
}

private getActiveAgents(tab: ChatTabState): AgentConfig[] {
  return getActiveAgents(tab);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/core
```
Expected: `Tests 46 passed (46)`

- [ ] **Step 5: Commit**

```bash
git add src/core/context-routing.ts src/core/runtime.ts
git commit -m "refactor: extract context-routing module from runtime"
```

---

## Task 2: Extract `accounting.ts`

**Files:**
- Create: `src/core/accounting.ts`
- Modify: `src/core/runtime.ts`

- [ ] **Step 1: Create `src/core/accounting.ts`**

```ts
import type {
  AgentConfig,
  AgentContextMessage,
  ChatTabState,
  TransportUsage,
} from './types';
import { findMessageEntryById } from './diagnostics';
import { emptyMetrics } from './workspace';

export function getPromptCostUsd(
  agent: AgentConfig,
  usage?: TransportUsage,
): number {
  const promptTokens = usage?.promptTokens;
  if (!promptTokens) return 0;
  const promptPrice = Number(agent.pricing?.prompt);
  if (!Number.isFinite(promptPrice) || promptPrice <= 0) return 0;
  return promptTokens * promptPrice;
}

export function applyUsage(
  agentId: string,
  usage: TransportUsage | undefined,
  tab: ChatTabState,
): void {
  if (!usage) return;
  const metrics = tab.metrics[agentId] ?? emptyMetrics();
  metrics.requestCount += 1;
  metrics.promptTokens += usage.promptTokens ?? 0;
  metrics.completionTokens += usage.completionTokens ?? 0;
  metrics.totalTokens += usage.totalTokens ?? 0;
  metrics.estimatedCost += usage.estimatedCost ?? 0;
  tab.metrics[agentId] = metrics;
}

export function applyDownstreamPromptCost(
  receivingAgent: AgentConfig,
  visibleMessages: AgentContextMessage[],
  usage: TransportUsage | undefined,
  tab: ChatTabState,
): void {
  const promptCostUsd = getPromptCostUsd(receivingAgent, usage);
  if (promptCostUsd <= 0) return;

  const listenedMessages = visibleMessages.filter(
    (message) => message.senderId !== receivingAgent.id,
  );
  if (!listenedMessages.length) return;

  const promptCostPerMessage = promptCostUsd / listenedMessages.length;
  for (const visibleMessage of listenedMessages) {
    const entry = findMessageEntryById(visibleMessage.id, tab);
    if (!entry) continue;
    const message = entry.message;

    message.downstreamPromptCostUsd =
      (message.downstreamPromptCostUsd ?? 0) + promptCostPerMessage;
    const existingContributors =
      message.downstreamPromptCostContributors ?? [];
    const existingContributor = existingContributors.find(
      (c) => c.agentId === receivingAgent.id,
    );
    if (existingContributor) {
      existingContributor.promptCostUsd += promptCostPerMessage;
      existingContributor.listenCount += 1;
    } else {
      existingContributors.push({
        agentId: receivingAgent.id,
        promptCostUsd: promptCostPerMessage,
        listenCount: 1,
      });
    }
    message.downstreamPromptCostContributors = existingContributors;
    message.costUsd =
      (message.requestCostUsd ?? 0) + message.downstreamPromptCostUsd;
  }
}
```

- [ ] **Step 2: Update `runtime.ts` — add import, replace private methods**

Add to imports:
```ts
import {
  applyDownstreamPromptCost,
  applyUsage,
  getPromptCostUsd,
} from './accounting';
```

Replace the three private methods with delegating wrappers:
```ts
private getPromptCostUsd(agent: AgentConfig, usage?: TransportUsage): number {
  return getPromptCostUsd(agent, usage);
}

private applyUsage(
  agentId: string,
  usage: TransportUsage | undefined,
  tab: ChatTabState,
): void {
  applyUsage(agentId, usage, tab);
}

private applyDownstreamPromptCost(
  receivingAgent: AgentConfig,
  visibleMessages: AgentContextMessage[],
  usage: TransportUsage | undefined,
  tab: ChatTabState,
): void {
  applyDownstreamPromptCost(receivingAgent, visibleMessages, usage, tab);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/core
```
Expected: `Tests 46 passed (46)`

- [ ] **Step 4: Commit**

```bash
git add src/core/accounting.ts src/core/runtime.ts
git commit -m "refactor: extract accounting module from runtime"
```

---

## Task 3: Extract `traces.ts`

**Files:**
- Create: `src/core/traces.ts`
- Modify: `src/core/runtime.ts`

- [ ] **Step 1: Create `src/core/traces.ts`**

```ts
import type { ChatMessage, ChatTabState, RequestTrace } from './types';
import {
  cloneTraces,
  getMessageById,
  getMessageInspectionIndexEntry,
} from './diagnostics';
import { deepClone } from './utils';

export function getRelatedRequestTraces(
  traceId: string,
  tab: ChatTabState,
): RequestTrace[] {
  const trace = tab.requestTraces[traceId];
  if (!trace) return [];

  const relatedTraceIds = new Set<string>();
  if (trace.parentTraceId) relatedTraceIds.add(trace.parentTraceId);
  for (const childTraceId of trace.childTraceIds) {
    relatedTraceIds.add(childTraceId);
  }
  for (const messageId of [
    ...trace.triggeringMessageIds,
    ...trace.visibleMessageIds,
    ...trace.downstreamMessageIds,
  ]) {
    const index = tab.messageInspectionIndex[messageId];
    for (const relatedTraceId of index?.downstreamTraceIds ?? []) {
      if (relatedTraceId !== traceId) relatedTraceIds.add(relatedTraceId);
    }
    if (index?.sourceTraceId && index.sourceTraceId !== traceId) {
      relatedTraceIds.add(index.sourceTraceId);
    }
  }

  return Array.from(relatedTraceIds)
    .map((id) => tab.requestTraces[id])
    .filter((item): item is RequestTrace => Boolean(item))
    .map((item) => deepClone(item));
}

export function getInspectionSubjectForMessage(
  messageId: string,
  tab: ChatTabState,
): {
  message: ChatMessage | null;
  sourceTrace: RequestTrace | null;
  triggeringTraces: RequestTrace[];
  visibleOnlyTraces: RequestTrace[];
  downstreamTraces: RequestTrace[];
} {
  const message = getMessageById(messageId, tab);
  const index = getMessageInspectionIndexEntry(messageId, tab);
  const sourceTrace = index.sourceTraceId
    ? (tab.requestTraces[index.sourceTraceId] ?? null)
    : null;
  const triggeringTraceIds = new Set(index.triggeringTraceIds);
  const visibleOnlyTraceIds = index.visibleTraceIds.filter(
    (traceId) => !triggeringTraceIds.has(traceId),
  );
  const downstreamTraceIds = [
    ...index.triggeringTraceIds,
    ...visibleOnlyTraceIds,
  ];

  return {
    message: deepClone(message ?? null),
    sourceTrace: deepClone(sourceTrace),
    triggeringTraces: cloneTraces(index.triggeringTraceIds, tab),
    visibleOnlyTraces: cloneTraces(visibleOnlyTraceIds, tab),
    downstreamTraces: cloneTraces(downstreamTraceIds, tab),
  };
}

export function getMessageInspectionGraph(
  messageId: string,
  tab: ChatTabState,
): {
  message: ChatMessage | null;
  sourceTrace: RequestTrace | null;
  triggeringTraces: RequestTrace[];
  visibleOnlyTraces: RequestTrace[];
  downstreamTraces: RequestTrace[];
  relatedMessages: ChatMessage[];
} {
  const subject = getInspectionSubjectForMessage(messageId, tab);
  const relatedMessageIds = new Set<string>();

  for (const trace of [
    ...subject.triggeringTraces,
    ...subject.visibleOnlyTraces,
    ...(subject.sourceTrace ? [subject.sourceTrace] : []),
  ]) {
    for (const relatedMessageId of [
      ...trace.triggeringMessageIds,
      ...trace.visibleMessageIds,
      ...trace.downstreamMessageIds,
      ...(trace.producedMessageId ? [trace.producedMessageId] : []),
    ]) {
      relatedMessageIds.add(relatedMessageId);
    }
  }
  relatedMessageIds.delete(messageId);

  return {
    ...subject,
    relatedMessages: Array.from(relatedMessageIds)
      .map((id) => getMessageById(id, tab))
      .filter((item): item is ChatMessage => Boolean(item))
      .map((item) => deepClone(item)),
  };
}
```

- [ ] **Step 2: Update `runtime.ts` — add import, replace method bodies**

Add to imports:
```ts
import {
  getInspectionSubjectForMessage as getInspectionSubjectFn,
  getMessageInspectionGraph as getMessageInspectionGraphFn,
  getRelatedRequestTraces as getRelatedRequestTracesFn,
} from './traces';
```

Replace the three method bodies (keep signatures, delegate):
```ts
getRelatedRequestTraces(
  traceId: string,
  tabId = this.workspace.activeTabId,
): RequestTrace[] {
  return getRelatedRequestTracesFn(traceId, this.requireTab(tabId));
}

getInspectionSubjectForMessage(
  messageId: string,
  tabId = this.workspace.activeTabId,
) {
  return getInspectionSubjectFn(messageId, this.requireTab(tabId));
}

getMessageInspectionGraph(
  messageId: string,
  tabId = this.workspace.activeTabId,
) {
  return getMessageInspectionGraphFn(messageId, this.requireTab(tabId));
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/core
```
Expected: `Tests 46 passed (46)`

- [ ] **Step 4: Commit**

```bash
git add src/core/traces.ts src/core/runtime.ts
git commit -m "refactor: extract traces inspection module from runtime"
```

---

## Task 4: Extract `messaging.ts`

**Files:**
- Create: `src/core/messaging.ts`
- Modify: `src/core/runtime.ts`

- [ ] **Step 1: Create `src/core/messaging.ts`**

```ts
import type {
  ChatMessage,
  ChatTabState,
  SendMessageInput,
  SendSystemMessageInput,
  WorkspaceState,
} from './types';
import { pushDebugLog, updateMessageSourceTrace } from './diagnostics';
import { SYSTEM_AUTHOR_NAME } from './messages';

export function publishMessageToTab(
  input: Omit<SendMessageInput, 'senderId'> & {
    senderId?: string;
    kind?: ChatMessage['kind'];
    system?: ChatMessage['system'];
  },
  tab: ChatTabState,
  workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { message: ChatMessage; triggersSweep: boolean } {
  if (input.target === 'private' && !input.recipientId) {
    throw new Error('Private message requires recipientId');
  }
  if (input.kind !== 'system' && !input.senderId) {
    throw new Error('Participant message requires senderId');
  }

  const triggersSweep = input.triggerSweep ?? true;
  const createdInSweep =
    input.createdInSweep ??
    (triggersSweep ? tab.execution.sweepCount + 1 : undefined);

  const message: ChatMessage = {
    id: createId(),
    author:
      input.kind === 'system'
        ? { type: 'system' }
        : { type: 'participant', participantId: input.senderId! },
    kind: input.kind ?? 'participant',
    target: input.target,
    recipientId: input.recipientId,
    content: input.content.trim(),
    system: input.system,
    createdAt: now().toISOString(),
    requestCostUsd: input.requestCostUsd ?? input.costUsd,
    ownPromptCostUsd: input.ownPromptCostUsd,
    downstreamPromptCostUsd: input.downstreamPromptCostUsd,
    downstreamPromptCostContributors: input.downstreamPromptCostContributors,
    costUsd:
      (input.requestCostUsd ?? input.costUsd ?? 0) +
        (input.downstreamPromptCostUsd ?? 0) || undefined,
    createdInSweep,
    sourceTraceId: input.sourceTraceId,
  };

  tab.timeline.push({
    id: message.id,
    createdAt: message.createdAt,
    kind: 'message',
    message,
  });
  updateMessageSourceTrace(message.id, input.sourceTraceId, tab);

  const senderName =
    input.kind === 'system'
      ? SYSTEM_AUTHOR_NAME
      : (tab.participants.find((p) => p.id === input.senderId)?.name ??
        input.senderId ??
        '');

  pushDebugLog({
    now,
    workspace,
    payload: {
      kind: 'message-created',
      sweep: message.createdInSweep,
      messageId: message.id,
      agentId: input.kind === 'system' ? undefined : input.senderId,
      agentName: senderName,
      target: message.target,
      recipientId: message.recipientId,
      content: message.content,
      details: triggersSweep
        ? 'message triggers sweep'
        : 'message does not trigger sweep',
    },
  });

  return { message, triggersSweep };
}

export function publishSystemMessageToTab(
  input: SendSystemMessageInput,
  tab: ChatTabState,
  workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { message: ChatMessage; triggersSweep: boolean } {
  return publishMessageToTab(
    {
      content: input.content,
      target: 'public',
      triggerSweep: input.triggerSweep,
      kind: 'system',
      system: input.system,
    },
    tab,
    workspace,
    now,
    createId,
  );
}
```

- [ ] **Step 2: Update `runtime.ts` — add import, replace private methods**

Add to imports:
```ts
import {
  publishMessageToTab,
  publishSystemMessageToTab,
} from './messaging';
```

Replace the two private methods:
```ts
private publishMessage(
  input: Omit<SendMessageInput, 'senderId'> & {
    senderId?: string;
    kind?: ChatMessage['kind'];
    system?: ChatMessage['system'];
  },
  tabId: string,
): { message: ChatMessage; triggersSweep: boolean } {
  const tab = this.requireTab(tabId);
  const result = publishMessageToTab(
    input,
    tab,
    this.workspace,
    this.now,
    this.createId,
  );
  this.persistAndNotify();
  return result;
}

private publishSystemMessage(
  input: SendSystemMessageInput,
  tabId: string,
): { message: ChatMessage; triggersSweep: boolean } {
  const tab = this.requireTab(tabId);
  const result = publishSystemMessageToTab(
    input,
    tab,
    this.workspace,
    this.now,
    this.createId,
  );
  this.persistAndNotify();
  return result;
}
```

Also remove the now-unused `participantName` private method reference from `publishMessage` — the name lookup is now inlined in `messaging.ts`.

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/core
```
Expected: `Tests 46 passed (46)`

- [ ] **Step 4: Commit**

```bash
git add src/core/messaging.ts src/core/runtime.ts
git commit -m "refactor: extract messaging module from runtime"
```

---

## Task 5: Extract `execution.ts`

This is the largest extraction. The execution engine calls back into the runtime (to send messages, update agents, persist state). We pass these dependencies via `ExecutionContext`.

**Important:** `sendMessage` in `ExecutionContext` routes through `MultiChatRuntime.sendMessage`, which calls `persistAndNotify` and fires all listeners immediately — each agent message is visible to subscribers mid-sweep. This is intentional.

**Files:**
- Create: `src/core/execution.ts`
- Modify: `src/core/runtime.ts`

- [ ] **Step 1: Create `src/core/execution.ts`**

```ts
import type {
  AgentConfig,
  AgentContextMessage,
  AgentExecutionMode,
  AgentTurnResult,
  ChatMessage,
  ChatTabState,
  OpenRouterTransport,
  SendMessageInput,
  TransportUsage,
  WorkspaceState,
} from './types';
import {
  attachProducedMessageToTrace,
  completeRequestTrace,
  createRequestTrace,
  pushDebugLog,
  pushRuntimeError,
  pushRuntimeEvent,
} from './diagnostics';
import {
  applyDownstreamPromptCost,
  applyUsage,
  getPromptCostUsd,
} from './accounting';
import {
  getActiveAgents,
  getNonSelfVisibleMessageIds,
  getTriggeringMessageIds,
  getVisibleContextKey,
  getVisibleMessagesForAgent,
  hasNewVisibleInputForAgent,
  markVisibleContextProcessed,
} from './context-routing';
import { deepClone } from './utils';

export interface ExecutionContext {
  workspace: WorkspaceState;
  transport: OpenRouterTransport;
  abortControllers: Map<string, AbortController>;
  activeSweepPromises: Map<string, Promise<void>>;
  maxAutoSweeps: number;
  maxContextMessages: number;
  now: () => Date;
  createId: () => string;
  lastProcessedKeys: Map<string, Map<string, string>>;
  participantName: (participantId: string, tab: ChatTabState) => string;
  sendMessage: (input: SendMessageInput, tabId: string) => Promise<ChatMessage>;
  updateAgent: (
    agentId: string,
    patch: Partial<Omit<AgentConfig, 'id'>>,
    tabId: string,
  ) => AgentConfig;
  persistAndNotify: () => void;
}

function getTab(tabId: string, ctx: ExecutionContext): ChatTabState | undefined {
  return ctx.workspace.tabs.find((tab) => tab.id === tabId);
}

function lastProcessedKeysForTab(
  tabId: string,
  ctx: ExecutionContext,
): Map<string, string> {
  let keys = ctx.lastProcessedKeys.get(tabId);
  if (!keys) {
    keys = new Map<string, string>();
    ctx.lastProcessedKeys.set(tabId, keys);
  }
  return keys;
}

export function chooseAgentMode(agent: AgentConfig): AgentExecutionMode {
  if (
    agent.capabilities.prefersTools &&
    agent.capabilities.supportsToolUse !== 'unsupported'
  ) {
    return 'tools';
  }
  return 'json';
}

export function updateToolSupportOnTab(
  agentId: string,
  mode: AgentExecutionMode,
  tab: ChatTabState,
): void {
  if (mode !== 'tools') return;
  const agent = tab.agents.find((item) => item.id === agentId);
  if (!agent) return;
  agent.capabilities.supportsToolUse = 'supported';
}

export async function handleSuccessfulAgentTurnResultFn({
  agent,
  result,
  traceId,
  tab,
  tabId,
  visibleMessages,
  fallback,
  updateToolSupport,
  ctx,
}: {
  agent: AgentConfig;
  result: AgentTurnResult;
  traceId: string;
  tab: ChatTabState;
  tabId: string;
  visibleMessages: AgentContextMessage[];
  fallback: boolean;
  updateToolSupport: boolean;
  ctx: ExecutionContext;
}): Promise<void> {
  markVisibleContextProcessed(
    agent.id,
    tab,
    lastProcessedKeysForTab(tab.id, ctx),
    ctx.maxContextMessages,
  );
  applyUsage(agent.id, result.usage, tab);
  applyDownstreamPromptCost(agent, visibleMessages, result.usage, tab);
  if (updateToolSupport) {
    updateToolSupportOnTab(agent.id, result.mode, tab);
  }
  completeRequestTrace({
    now: ctx.now,
    traceId,
    tab,
    status: 'succeeded',
    usage: result.usage,
    action: result.action,
    promptCostUsd: getPromptCostUsd(agent, result.usage),
  });

  if (result.action.type === 'stay_silent') {
    const requestCostUsd = result.usage?.estimatedCost;
    const ownPromptCostUsd = getPromptCostUsd(agent, result.usage);
    pushRuntimeEvent({
      createId: ctx.createId,
      now: ctx.now,
      tab,
      payload: {
        type: 'silent-decision',
        agentId: agent.id,
        details: result.action.reason,
        sourceTraceId: traceId,
        requestCostUsd,
        ownPromptCostUsd,
        costUsd: requestCostUsd,
      },
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
        actionType: result.action.type,
        details: result.action.reason,
      },
    });
    ctx.persistAndNotify();
    return;
  }

  const sentMessage = await ctx.sendMessage(
    {
      senderId: agent.id,
      content: result.action.text,
      target: result.action.type === 'speak_public' ? 'public' : 'private',
      recipientId:
        result.action.type === 'send_private' ? result.action.to : undefined,
      requestCostUsd: result.usage?.estimatedCost,
      ownPromptCostUsd: getPromptCostUsd(agent, result.usage),
      createdInSweep: tab.execution.sweepCount,
      sourceTraceId: traceId,
      triggerSweep: false,
    },
    tabId,
  );
  attachProducedMessageToTrace(traceId, sentMessage.id, tab);
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
      actionType: result.action.type,
      messageId: sentMessage.id,
      target: sentMessage.target,
      recipientId: sentMessage.recipientId,
      content: result.action.text,
    },
  });
  tab.execution.queuedSweep = true;
}

export async function runAgentTurnFn(
  agent: AgentConfig,
  tabId: string,
  ctx: ExecutionContext,
): Promise<void> {
  const tab = getTab(tabId, ctx);
  if (!tab) return;

  if (tab.execution.stopRequested) {
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'turn-skipped',
        sweep: tab.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        skipReason: 'stop_requested',
      },
    });
    return;
  }

  const processedKeys = lastProcessedKeysForTab(tab.id, ctx);
  const visibleMessages = getVisibleMessagesForAgent(
    agent.id,
    tab,
    ctx.maxContextMessages,
  );

  if (!hasNewVisibleInputForAgent(agent.id, tab, processedKeys, ctx.maxContextMessages)) {
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'turn-skipped',
        sweep: tab.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        skipReason: 'no_new_input',
        visibleMessageIds: visibleMessages.map((m) => m.id),
        nonSelfVisibleMessageIds: getNonSelfVisibleMessageIds(
          agent.id,
          tab,
          ctx.maxContextMessages,
        ),
        contextKeyPrev: processedKeys.get(agent.id) ?? '',
        contextKeyNext: getVisibleContextKey(agent.id, tab, ctx.maxContextMessages),
      },
    });
    return;
  }

  const apiKey = ctx.workspace.settings.openRouterApiKey;
  if (!apiKey) {
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'turn-skipped',
        sweep: tab.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        skipReason: 'no_api_key',
        visibleMessageIds: visibleMessages.map((m) => m.id),
        nonSelfVisibleMessageIds: getNonSelfVisibleMessageIds(
          agent.id,
          tab,
          ctx.maxContextMessages,
        ),
        contextKeyPrev: processedKeys.get(agent.id) ?? '',
        contextKeyNext: getVisibleContextKey(agent.id, tab, ctx.maxContextMessages),
      },
    });
    pushRuntimeError({
      createId: ctx.createId,
      now: ctx.now,
      tab,
      workspace: ctx.workspace,
      participantName: ctx.participantName,
      payload: {
        agentId: agent.id,
        message: 'OpenRouter API key is missing',
      },
    });
    return;
  }

  const mode = chooseAgentMode(agent);
  const abortController = new AbortController();
  ctx.abortControllers.set(tab.id, abortController);
  const previousContextKey = processedKeys.get(agent.id) ?? '';
  const nextContextKey = getVisibleContextKey(agent.id, tab, ctx.maxContextMessages);
  const nonSelfVisibleMessageIds = getNonSelfVisibleMessageIds(
    agent.id,
    tab,
    ctx.maxContextMessages,
  );
  const triggeringMessageIds = getTriggeringMessageIds(
    previousContextKey,
    nonSelfVisibleMessageIds,
  );
  const trace = createRequestTrace({
    createId: ctx.createId,
    now: ctx.now,
    tab,
    agent,
    mode,
    fallback: false,
    parentTraceId: null,
    triggeringMessageIds,
    visibleMessageIds: visibleMessages.map((m) => m.id),
    nonSelfVisibleMessageIds,
  });
  pushDebugLog({
    now: ctx.now,
    workspace: ctx.workspace,
    payload: {
      kind: 'turn-requested',
      sweep: tab.execution.sweepCount,
      agentId: agent.id,
      agentName: agent.name,
      mode,
      fallback: false,
      visibleMessageIds: visibleMessages.map((m) => m.id),
      nonSelfVisibleMessageIds,
      triggeringMessageIds,
      contextKeyPrev: previousContextKey,
      contextKeyNext: nextContextKey,
    },
  });

  try {
    const result = await ctx.transport.runAgentTurn({
      apiKey,
      context: {
        agent,
        participants: deepClone(tab.participants),
        visibleMessages,
      },
      mode,
      signal: abortController.signal,
    });

    await handleSuccessfulAgentTurnResultFn({
      agent,
      result,
      traceId: trace.id,
      tab,
      tabId,
      visibleMessages,
      fallback: false,
      updateToolSupport: true,
      ctx,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      completeRequestTrace({
        now: ctx.now,
        traceId: trace.id,
        tab,
        status: 'aborted',
        error: 'Agent request aborted',
        promptCostUsd: 0,
      });
      pushRuntimeEvent({
        createId: ctx.createId,
        now: ctx.now,
        tab,
        payload: {
          type: 'sweep-stopped',
          agentId: agent.id,
          details: 'Agent request aborted',
        },
      });
      pushDebugLog({
        now: ctx.now,
        workspace: ctx.workspace,
        payload: {
          kind: 'sweep-stopped',
          sweep: tab.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          details: 'Agent request aborted',
        },
      });
      ctx.persistAndNotify();
      return;
    }

    const message =
      error instanceof Error ? error.message : 'Unknown agent runtime error';
    completeRequestTrace({
      now: ctx.now,
      traceId: trace.id,
      tab,
      status: 'failed',
      error: message,
      promptCostUsd: 0,
    });
    pushRuntimeError({
      createId: ctx.createId,
      now: ctx.now,
      tab,
      workspace: ctx.workspace,
      participantName: ctx.participantName,
      payload: {
        agentId: agent.id,
        message: 'Agent turn failed',
        details: message,
        sourceTraceId: trace.id,
      },
    });

    if (mode === 'tools') {
      ctx.updateAgent(
        agent.id,
        {
          capabilities: {
            ...agent.capabilities,
            supportsToolUse: 'unsupported',
          },
        },
        tabId,
      );

      let fallbackTraceId: string | null = null;
      try {
        const fallbackTrace = createRequestTrace({
          createId: ctx.createId,
          now: ctx.now,
          tab,
          agent,
          mode: 'json',
          fallback: true,
          parentTraceId: trace.id,
          triggeringMessageIds,
          visibleMessageIds: visibleMessages.map((m) => m.id),
          nonSelfVisibleMessageIds,
        });
        fallbackTraceId = fallbackTrace.id;
        pushDebugLog({
          now: ctx.now,
          workspace: ctx.workspace,
          payload: {
            kind: 'turn-requested',
            sweep: tab.execution.sweepCount,
            agentId: agent.id,
            agentName: agent.name,
            mode: 'json',
            fallback: true,
            visibleMessageIds: visibleMessages.map((m) => m.id),
            nonSelfVisibleMessageIds,
            triggeringMessageIds,
            contextKeyPrev: previousContextKey,
            contextKeyNext: nextContextKey,
            details: 'JSON fallback after tool failure',
          },
        });
        const fallback = await ctx.transport.runAgentTurn({
          apiKey,
          context: {
            agent: {
              ...agent,
              capabilities: {
                ...agent.capabilities,
                supportsToolUse: 'unsupported',
              },
            },
            participants: deepClone(tab.participants),
            visibleMessages,
          },
          mode: 'json',
          signal: abortController.signal,
        });

        await handleSuccessfulAgentTurnResultFn({
          agent,
          result: fallback,
          traceId: fallbackTrace.id,
          tab,
          tabId,
          visibleMessages,
          fallback: true,
          updateToolSupport: false,
          ctx,
        });
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : 'Unknown JSON fallback error';
        if (fallbackTraceId) {
          completeRequestTrace({
            now: ctx.now,
            traceId: fallbackTraceId,
            tab,
            status:
              fallbackError instanceof Error &&
              fallbackError.name === 'AbortError'
                ? 'aborted'
                : 'failed',
            error: fallbackMessage,
            promptCostUsd: 0,
          });
        }
        pushRuntimeError({
          createId: ctx.createId,
          now: ctx.now,
          tab,
          workspace: ctx.workspace,
          participantName: ctx.participantName,
          payload: {
            agentId: agent.id,
            message: 'JSON fallback failed',
            details: fallbackMessage,
            sourceTraceId: fallbackTraceId ?? undefined,
          },
        });
        ctx.persistAndNotify();
      }
    } else {
      ctx.persistAndNotify();
    }
  } finally {
    if (ctx.abortControllers.get(tab.id) === abortController) {
      ctx.abortControllers.delete(tab.id);
    }
  }
}

export async function runAgentSweepFn(
  trigger: string,
  tabId: string,
  ctx: ExecutionContext,
): Promise<void> {
  const tab = getTab(tabId, ctx);
  if (!tab) return;

  const activeSweepPromise = ctx.activeSweepPromises.get(tabId);
  if (activeSweepPromise) {
    if (!tab.execution.stopRequested) {
      tab.execution.queuedSweep = true;
    }
    ctx.persistAndNotify();
    await activeSweepPromise;
    return;
  }

  const sweepPromise = (async () => {
    if (trigger === 'manual') {
      ctx.lastProcessedKeys.get(tabId)?.clear();
    }

    let loops = 0;
    tab.execution.stopRequested = false;

    do {
      const currentTab = getTab(tabId, ctx);
      if (!currentTab || currentTab.execution.stopRequested) break;

      currentTab.execution.isSweepRunning = true;
      currentTab.execution.queuedSweep = false;
      currentTab.execution.sweepCount += 1;
      pushRuntimeEvent({
        createId: ctx.createId,
        now: ctx.now,
        tab: currentTab,
        payload: { type: 'sweep-started', details: trigger },
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

      for (const agent of getActiveAgents(currentTab)) {
        const latestTab = getTab(tabId, ctx);
        if (!latestTab || latestTab.execution.stopRequested) break;
        await runAgentTurnFn(agent, tabId, ctx);
      }

      const latestTab = getTab(tabId, ctx);
      if (!latestTab) break;

      latestTab.execution.isSweepRunning = false;
      pushRuntimeEvent({
        createId: ctx.createId,
        now: ctx.now,
        tab: latestTab,
        payload: { type: 'sweep-finished', details: trigger },
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

  ctx.activeSweepPromises.set(tabId, sweepPromise);
  try {
    await sweepPromise;
  } finally {
    if (ctx.activeSweepPromises.get(tabId) === sweepPromise) {
      ctx.activeSweepPromises.delete(tabId);
    }
  }
}
```

- [ ] **Step 2: Update `runtime.ts` — add imports, add `buildExecutionContext`, replace private methods**

Add to imports:
```ts
import {
  chooseAgentMode,
  ExecutionContext,
  handleSuccessfulAgentTurnResultFn,
  runAgentSweepFn,
  runAgentTurnFn,
  updateToolSupportOnTab,
} from './execution';
```

Add `buildExecutionContext` private method:
```ts
private buildExecutionContext(): ExecutionContext {
  return {
    workspace: this.workspace,
    transport: this.config.transport,
    abortControllers: this.abortControllers,
    activeSweepPromises: this.activeSweepPromises,
    maxAutoSweeps: this.maxAutoSweeps,
    maxContextMessages: this.maxContextMessages,
    now: this.now,
    createId: this.createId,
    lastProcessedKeys: this.lastProcessedVisibleContextKeys,
    participantName: (participantId, tab) =>
      this.participantName(participantId, tab),
    sendMessage: (input, tabId) => this.sendMessage(input, tabId),
    updateAgent: (agentId, patch, tabId) =>
      this.updateAgent(agentId, patch, tabId),
    persistAndNotify: () => this.persistAndNotify(),
  };
}
```

Replace `runAgentSweep` public method body:
```ts
async runAgentSweep(
  trigger: string,
  tabId = this.workspace.activeTabId,
): Promise<void> {
  await runAgentSweepFn(trigger, tabId, this.buildExecutionContext());
}
```

Replace `runAgentTurn` private method body:
```ts
private async runAgentTurn(
  agent: AgentConfig,
  tabId: string,
): Promise<void> {
  await runAgentTurnFn(agent, tabId, this.buildExecutionContext());
}
```

Replace `handleSuccessfulAgentTurnResult` private method body:
```ts
private async handleSuccessfulAgentTurnResult(params: {
  agent: AgentConfig;
  result: AgentTurnResult;
  traceId: string;
  tab: ChatTabState;
  tabId: string;
  visibleMessages: AgentContextMessage[];
  fallback: boolean;
  updateToolSupport: boolean;
}): Promise<void> {
  await handleSuccessfulAgentTurnResultFn({
    ...params,
    ctx: this.buildExecutionContext(),
  });
}
```

Replace `chooseAgentMode` and `updateToolSupport` private methods:
```ts
private chooseAgentMode(agent: AgentConfig): AgentExecutionMode {
  return chooseAgentMode(agent);
}

private updateToolSupport(
  agentId: string,
  mode: AgentExecutionMode,
  tab: ChatTabState,
): void {
  updateToolSupportOnTab(agentId, mode, tab);
}
```

Note: After this step, `runAgentTurn` and `handleSuccessfulAgentTurnResult` are now thin wrappers. If TypeScript complains about them being called from `runAgentSweep` (since sweep logic is now in `execution.ts`), verify that `runAgentSweep` in `runtime.ts` simply delegates to `runAgentSweepFn` — the internal sweep loop no longer calls `this.runAgentTurn` directly.

You can remove `runAgentTurn` and `handleSuccessfulAgentTurnResult` private methods from `runtime.ts` entirely once you confirm nothing else in the class calls them.

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/core
```
Expected: `Tests 46 passed (46)`

- [ ] **Step 4: Check TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/core/execution.ts src/core/runtime.ts
git commit -m "refactor: extract execution engine module from runtime"
```

---

## Task 6: Final cleanup

- [ ] **Step 1: Remove now-empty delegating private methods from `runtime.ts`**

After the extractions, some private methods in `runtime.ts` are single-line delegating wrappers. Any wrapper that is only called from one place and adds no value (e.g., `private getContextWindowMessages(tab) { return getContextWindowMessages(tab); }`) can be inlined at its call site and the wrapper removed. This is optional cleanup — only do it if it makes the class easier to read.

- [ ] **Step 2: Verify final line count**

```bash
wc -l src/core/runtime.ts
```
Expected: under 1000 lines (target ~850–950)

- [ ] **Step 3: Run full core test suite one final time**

```bash
npm test -- tests/core
```
Expected: `Tests 46 passed (46)`

- [ ] **Step 4: Final commit**

```bash
git add src/core/runtime.ts
git commit -m "refactor: clean up delegating wrappers in runtime after decomposition"
```
