# runtime.ts Decomposition Design

**Date:** 2026-03-22
**Goal:** Reduce `src/core/runtime.ts` from 1726 lines to ~700 by extracting focused modules.
**Constraint:** Public API of `MultiChatRuntime` unchanged. All existing tests pass without modification.

---

## Motivation

`runtime.ts` contains a single class with ~10 distinct responsibilities. Navigation is painful. The codebase already uses the pattern of standalone modules with pure functions (`diagnostics.ts`, `workspace.ts`, `messages.ts`). This refactor continues that pattern.

---

## New File Structure

```
src/core/
├── runtime.ts          1726 → ~700 lines  (thin orchestrator)
├── context-routing.ts   NEW ~150 lines
├── accounting.ts        NEW  ~80 lines
├── execution.ts         NEW ~450 lines
├── messaging.ts         NEW ~100 lines
├── traces.ts            NEW ~120 lines
└── (existing files untouched)
```

---

## Module Definitions

### `context-routing.ts`

Pure functions. All accept explicit `tab`/`agentId` parameters — no shared state except `processedKeys` which is passed by reference.

Notes:
- `participants` is **not** a separate parameter — functions read `tab.participants` directly (it's already on the tab)
- `maxContextMessages` is a fallback; functions use `tab.contextWindowSize ?? maxContextMessages`, preserving per-tab overrides

Exports:
- `getContextWindowMessages(tab: ChatTabState): ChatMessage[]`
- `getVisibleMessagesForAgent(agentId, tab, maxContextMessages): AgentContextMessage[]`
- `isMessageVisibleToAgent(message, agentId): boolean`
- `isMessageVisibleToParticipant(message, participantId): boolean`
- `getAgentContextCutoffs(tab, maxContextMessages): AgentContextCutoff[]` — uses `tab.contextWindowSize ?? maxContextMessages`
- `getNonSelfVisibleMessageIds(agentId, tab, maxContextMessages): string[]`
- `getVisibleContextKey(agentId, tab, maxContextMessages): string`
- `hasNewVisibleInputForAgent(agentId, tab, processedKeys, maxContextMessages): boolean`
- `markVisibleContextProcessed(agentId, tab, processedKeys, maxContextMessages): void`
- `getTriggeringMessageIds(previousContextKey, nextVisibleMessageIds): string[]`
- `getActiveAgents(tab: ChatTabState): AgentConfig[]` — moved here from runtime private methods

### `accounting.ts`

Functions that mutate `tab` directly (tab passed by reference).

Exports:
- `getPromptCostUsd(agent: AgentConfig, usage?: TransportUsage): number`
- `applyUsage(agentId: string, usage: TransportUsage | undefined, tab: ChatTabState): void`
- `applyDownstreamPromptCost(receivingAgent, visibleMessages, usage, tab): void`

### `messaging.ts`

Creates and appends messages to `tab.timeline`. Does **not** call `persistAndNotify` — caller's responsibility.

Dependencies: imports `pushDebugLog`, `updateMessageSourceTrace` from `diagnostics.ts` and `SYSTEM_AUTHOR_NAME` from `messages.ts`.

Exports:
- `publishMessageToTab(input, tab, workspace, now, createId): { message: ChatMessage; triggersSweep: boolean }`
- `publishSystemMessageToTab` is a trivial adapter over `publishMessageToTab` (sets `kind: 'system'`, `target: 'public'`). May be inlined at call sites rather than exported separately.
- Participant name resolution (for debug log content) is inlined inside `publishMessageToTab` via `tab.participants` — no callback needed, avoids circular dependency with `execution.ts`.

### `traces.ts`

Pure read-only functions over `tab.requestTraces` and `tab.messageInspectionIndex`.

Exports:
- `getRelatedRequestTraces(traceId, tab): RequestTrace[]`
- `getInspectionSubjectForMessage(messageId, tab): { message, sourceTrace, triggeringTraces, visibleOnlyTraces, downstreamTraces }`
- `getMessageInspectionGraph(messageId, tab): { ...subject, relatedMessages }`

### `execution.ts`

Agent sweep and turn logic. Receives all runtime dependencies via `ExecutionContext`.

```ts
interface ExecutionContext {
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
  updateAgent: (agentId: string, patch: Partial<Omit<AgentConfig, 'id'>>, tabId: string) => AgentConfig;
  persistAndNotify: () => void;
}
```

**Re-entrancy note:** `sendMessage` in `ExecutionContext` calls back into `MultiChatRuntime.sendMessage`, which calls `persistAndNotify` and fires all listeners immediately. This means subscribers receive reactive updates as each agent message is produced mid-sweep — this is intentional (agents should see each other's output as it arrives).

Exports:
- `runAgentSweepFn(trigger, tabId, ctx: ExecutionContext): Promise<void>`
- `runAgentTurnFn(agent, tabId, ctx: ExecutionContext): Promise<void>`
- `handleSuccessfulAgentTurnResultFn(params, ctx: ExecutionContext): Promise<void>`
- `chooseAgentMode(agent: AgentConfig): AgentExecutionMode`
- `updateToolSupportOnTab(agentId, mode, tab): void`

---

## runtime.ts After Refactor

`MultiChatRuntime` keeps all public methods and all private state (`workspace`, `listeners`, `abortControllers`, etc.). Implementation is delegated to module functions.

### Delegation pattern

```ts
// Thin wrapper — delegates + calls persistAndNotify
private publishMessage(input, tabId) {
  const tab = this.requireTab(tabId);
  const result = publishMessageToTab(input, tab, this.workspace, this.now, this.createId);
  this.persistAndNotify();
  return result;
}

// Execution delegation
async runAgentSweep(trigger, tabId = this.workspace.activeTabId) {
  await runAgentSweepFn(trigger, tabId, this.buildExecutionContext());
}

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
    participantName: (participantId, tab) => this.participantName(participantId, tab),
    sendMessage: (input, tabId) => this.sendMessage(input, tabId),
    updateAgent: (agentId, patch, tabId) => this.updateAgent(agentId, patch, tabId),
    persistAndNotify: () => this.persistAndNotify(),
  };
}
```

Public methods on the class that previously called these private methods now call the module functions directly or through thin wrappers. The class retains methods for: subscribe/unsubscribe, getState, tab CRUD, agent CRUD, history/cutoff management, settings, stop, reset, listModels.

---

## What Stays in runtime.ts

- Class declaration, constructor, private fields (~35 lines)
- Subscription management: `subscribe`, `subscribeDiagnostics` (~30 lines)
- State getters: `getState`, `getWorkspaceState`, `getDiagnosticsState`, `getTimelineEntries`, `getRequestTrace` (~40 lines)
- Trace inspection delegation: `getRelatedRequestTraces`, `getInspectionSubjectForMessage`, `getMessageInspectionGraph` (~20 lines, thin wrappers)
- Agent CRUD: `createAgent`, `updateAgent`, `removeAgent` (~110 lines)
- Settings + human participant: `updateSettings`, `updateHumanParticipant` (~50 lines)
- Tab management: `createTab`, `renameTab`, `activateTab`, `moveTab`, `closeTab`, `updateTabContextWindowSize` (~200 lines)
- History/cutoff: `resetAgentHistoryContext`, `clearHistoryBeforeAgentCutoff`, `moveManualCutoffBefore`, `removeManualCutoff` (~100 lines)
- Execution delegation: `sendMessage`, `sendSystemMessage`, `runAgentSweep`, `stop`, `buildExecutionContext` (~60 lines)
- Messaging delegation: `publishMessage`, `publishSystemMessage` (~20 lines)
- Internal utils: `getTab`, `requireTab`, `requireActiveTab`, `participantName`, `lastProcessedKeysForTab`, `buildRuntimeState`, `buildDiagnosticsState`, `persist`, `persistAndNotify` (~80 lines)
- `listModels`, `reset`, visibility helpers delegation (~30 lines)

**Total runtime.ts estimate: ~850–950 lines** (down from 1726)

---

## Execution Order

1. `context-routing.ts` — no deps on new files
2. `accounting.ts` — no deps on new files
3. `traces.ts` — no deps on new files
4. `messaging.ts` — no deps on new files
5. `execution.ts` — imports context-routing, accounting
6. `runtime.ts` — update imports, delegate, remove extracted methods

Each step: extract functions → update runtime.ts imports → run tests → verify green.
