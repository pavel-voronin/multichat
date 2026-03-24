# Unified Timeline Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-level `TimelineMessageEntry`/`TimelineTechnicalEventEntry` wrapper pattern with a flat `ChatEntry` discriminated union where every timeline kind is a first-class type rendered by its own registered component.

**Architecture:** New `ChatEntry` union in `types.ts` with 9 flat kinds. `ChatTimeline.vue` dispatches via a component registry. Shared behaviour (inspection click, cost badge, drag targets) extracted into composables. Storage is reset, so no migration shims needed.

**Tech Stack:** TypeScript, Vue 3 (Composition API + `<script setup>`), Pinia, Vitest, TailwindCSS via semantic classes only.

**Spec:** `docs/superpowers/specs/2026-03-24-unified-timeline-entries-design.md`

---

## File Map

**Modify:**

- `src/core/types.ts` — all new entry types, remove old wrappers
- `src/core/messaging.ts` — create entries directly, not `ChatMessage` + wrapper
- `src/core/diagnostics.ts` — `pushRuntimeEvent` creates entries directly; rename `messageInspectionIndex`
- `src/core/context-routing.ts` — work with new entry types to build `AgentContextMessage`
- `src/core/traces.ts` — `messageInspectionIndex` → `entryInspectionIndex`
- `src/core/execution.ts` — replace `pushRuntimeEvent` calls with per-kind push functions; update `sendMessage` return type usage
- `src/core/runtime.ts` — update `sendMessage`/`sendSystemMessage` return types; replace `publishSystemMessage` with typed functions
- `src/vue/types.ts` — simplify `VisibleTimelineEntry`
- `src/vue/utils/timeline.ts` — update `buildVisibleTimelineEntries` for new kinds
- `src/vue/utils/chatFormatting.ts` — remove `ChatMessage`/`RuntimeEvent` formatters, add entry formatters
- `src/vue/stores/timeline.ts` — remove `canInspectEvent`/`RuntimeEvent`; expose `mutedEntryIds`
- `src/vue/stores/inspection.ts` — `ChatMessage` → `ParticipantMessageEntry`; rename fields
- `src/vue/stores/messageInput.ts` — remove `mentionMessageSender(ChatMessage)`; replace with `mentionParticipantById` only
- `src/vue/components/ChatTimeline.vue` — registry dispatch instead of `v-if` per kind
- `src/vue/components/RequestInspectionModal.vue` — rename `agentForCurrentMessage` → `agentForCurrentEntry` and other inspection store fields
- `tests/vue/components/multi-agent-chat/helpers.ts` — remove old type imports
- `tests/vue/components/multi-agent-chat/inspection.test.ts` — remove two system-message inspection tests (lines 380–408)

**Create:**

- `src/vue/composables/useEntryInspection.ts`
- `src/vue/composables/useEntryCost.ts`
- `src/vue/components/timeline/entryRegistry.ts`
- `src/vue/components/timeline/entries/ParticipantMessageEntry.vue`
- `src/vue/components/timeline/entries/ParticipantJoinedEntry.vue`
- `src/vue/components/timeline/entries/ParticipantLeftEntry.vue`
- `src/vue/components/timeline/entries/TopicChangedEntry.vue`
- `src/vue/components/timeline/entries/SilentDecisionEntry.vue`
- `src/vue/components/timeline/entries/RuntimeErrorEntry.vue`
- `src/vue/components/timeline/entries/SweepStartedEntry.vue`
- `src/vue/components/timeline/entries/SweepFinishedEntry.vue`
- `src/vue/components/timeline/entries/SweepStoppedEntry.vue`

**Delete:**

- `src/vue/components/timeline/MessageEntry.vue`
- `src/vue/components/timeline/TechnicalEventEntry.vue`
- `src/vue/components/timeline/ChatMessageLine.vue`

---

## Task 1: New core types

**Files:**

- Modify: `src/core/types.ts`

Replace `TimelineMessageEntry`, `TimelineTechnicalEventEntry`, `ChatMessage`, `RuntimeEvent` usage in the timeline with flat entry types. Keep `ChatMessage` for now — it is still used by `AgentContextMessage` construction; it will be deleted in Task 9.

- [ ] **Step 1: Add `ChatEntryBase` and all entry interfaces** after the existing `TimelineHistoryCutoffEntry` block (around line 231):

```typescript
export interface ChatEntryBase {
  id: string;
  createdAt: string;
  sourceTraceId?: string;
  costUsd?: number;
  requestCostUsd?: number;
  ownPromptCostUsd?: number;
  downstreamPromptCostUsd?: number;
  downstreamPromptCostContributors?: Array<{
    agentId: string;
    promptCostUsd: number;
    listenCount: number;
  }>;
}

export interface ParticipantMessageEntry extends ChatEntryBase {
  kind: 'participant-message';
  authorId: string;
  content: string;
  target: MessageTarget;
  recipientId?: string;
  createdInSweep?: number;
}

export interface ParticipantJoinedEntry extends ChatEntryBase {
  kind: 'participant-joined';
  participantId: string;
  participantName: string;
}

export interface ParticipantLeftEntry extends ChatEntryBase {
  kind: 'participant-left';
  participantId: string;
  participantName: string;
}

export interface TopicChangedEntry extends ChatEntryBase {
  kind: 'topic-changed';
  topicTitle: string;
}

export interface SilentDecisionEntry extends ChatEntryBase {
  kind: 'silent-decision';
  agentId: string;
  reason: string;
}

export interface RuntimeErrorEntry extends ChatEntryBase {
  kind: 'runtime-error';
  agentId: string;
  details: string;
}

export interface SweepStartedEntry extends ChatEntryBase {
  kind: 'sweep-started';
  agentId?: string;
}

export interface SweepFinishedEntry extends ChatEntryBase {
  kind: 'sweep-finished';
  agentId?: string;
}

export interface SweepStoppedEntry extends ChatEntryBase {
  kind: 'sweep-stopped';
  agentId?: string;
}

export type ChatEntry =
  | ParticipantMessageEntry
  | ParticipantJoinedEntry
  | ParticipantLeftEntry
  | TopicChangedEntry
  | SilentDecisionEntry
  | RuntimeErrorEntry
  | SweepStartedEntry
  | SweepFinishedEntry
  | SweepStoppedEntry;
```

- [ ] **Step 2: Replace `TimelineEntry` union** (currently lines 233–236):

```typescript
export type TimelineEntry = ChatEntry | TimelineHistoryCutoffEntry;
```

- [ ] **Step 3: Add `EntryInspectionIndex`** (same structure as `MessageInspectionIndex`, new name):

```typescript
export interface EntryInspectionIndex {
  sourceTraceId?: string;
  downstreamTraceIds: string[];
  triggeringTraceIds: string[];
  visibleTraceIds: string[];
}
```

- [ ] **Step 4: Update `ChatTabState`** — rename `messageInspectionIndex` field:

```typescript
// was: messageInspectionIndex: Record<string, MessageInspectionIndex>;
entryInspectionIndex: Record<string, EntryInspectionIndex>;
```

- [ ] **Step 5: Update `DiagnosticsState`** — same rename:

```typescript
// was: messageInspectionIndex: Record<string, MessageInspectionIndex>;
entryInspectionIndex: Record<string, EntryInspectionIndex>;
```

- [ ] **Step 6: Run typecheck to see all downstream breakage**

```bash
cd /Users/pavel/projects/multichat && npm run typecheck 2>&1 | head -80
```

Expected: many errors pointing to every file that references the old types. This is the guide for the remaining tasks.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add ChatEntry union and EntryInspectionIndex types"
```

---

## Task 2: Core messaging — create entries directly

**Files:**

- Modify: `src/core/messaging.ts`

`publishMessageToTab` currently creates a `ChatMessage` and wraps it in `TimelineMessageEntry`. Replace with direct entry creation. The function now returns `{ entry: ParticipantMessageEntry; triggersSweep: boolean }` for participant messages.

For system events (`participant_joined`, `participant_left`, `topic_changed`), `publishSystemMessageToTab` is replaced by three typed functions.

- [ ] **Step 1: Rewrite `messaging.ts`**

```typescript
import type {
  ChatTabState,
  MessageTarget,
  ParticipantJoinedEntry,
  ParticipantLeftEntry,
  ParticipantMessageEntry,
  TopicChangedEntry,
  WorkspaceState,
} from './types';
import { pushDebugLog, updateEntrySourceTrace } from './diagnostics';

export function publishParticipantMessage(
  input: {
    senderId: string;
    content: string;
    target: MessageTarget;
    recipientId?: string;
    costUsd?: number;
    requestCostUsd?: number;
    ownPromptCostUsd?: number;
    downstreamPromptCostUsd?: number;
    downstreamPromptCostContributors?: Array<{
      agentId: string;
      promptCostUsd: number;
      listenCount: number;
    }>;
    createdInSweep?: number;
    sourceTraceId?: string;
    triggerSweep?: boolean;
  },
  tab: ChatTabState,
  workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { entry: ParticipantMessageEntry; triggersSweep: boolean } {
  if (input.target === 'private' && !input.recipientId) {
    throw new Error('Private message requires recipientId');
  }

  const triggersSweep = input.triggerSweep ?? true;
  const createdInSweep =
    input.createdInSweep ??
    (triggersSweep ? tab.execution.sweepCount + 1 : undefined);

  const entry: ParticipantMessageEntry = {
    id: createId(),
    kind: 'participant-message',
    createdAt: now().toISOString(),
    authorId: input.senderId,
    content: input.content.trim(),
    target: input.target,
    recipientId: input.recipientId,
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

  tab.timeline.push(entry);
  updateEntrySourceTrace(entry.id, input.sourceTraceId, tab);

  const senderName =
    tab.participants.find((p) => p.id === input.senderId)?.name ??
    input.senderId ??
    '';

  pushDebugLog({
    now,
    workspace,
    payload: {
      kind: 'message-created',
      sweep: entry.createdInSweep,
      messageId: entry.id,
      agentId: input.senderId,
      agentName: senderName,
      target: entry.target,
      recipientId: entry.recipientId,
      content: entry.content,
      details: triggersSweep
        ? 'message triggers sweep'
        : 'message does not trigger sweep',
    },
  });

  return { entry, triggersSweep };
}

export function publishParticipantJoined(
  input: {
    participantId: string;
    participantName: string;
    triggerSweep?: boolean;
  },
  tab: ChatTabState,
  _workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { entry: ParticipantJoinedEntry; triggersSweep: boolean } {
  const entry: ParticipantJoinedEntry = {
    id: createId(),
    kind: 'participant-joined',
    createdAt: now().toISOString(),
    participantId: input.participantId,
    participantName: input.participantName,
  };
  tab.timeline.push(entry);
  return { entry, triggersSweep: input.triggerSweep ?? true };
}

export function publishParticipantLeft(
  input: {
    participantId: string;
    participantName: string;
    triggerSweep?: boolean;
  },
  tab: ChatTabState,
  _workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { entry: ParticipantLeftEntry; triggersSweep: boolean } {
  const entry: ParticipantLeftEntry = {
    id: createId(),
    kind: 'participant-left',
    createdAt: now().toISOString(),
    participantId: input.participantId,
    participantName: input.participantName,
  };
  tab.timeline.push(entry);
  return { entry, triggersSweep: input.triggerSweep ?? true };
}

export function publishTopicChanged(
  input: { topicTitle: string; triggerSweep?: boolean },
  tab: ChatTabState,
  _workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { entry: TopicChangedEntry; triggersSweep: boolean } {
  const entry: TopicChangedEntry = {
    id: createId(),
    kind: 'topic-changed',
    createdAt: now().toISOString(),
    topicTitle: input.topicTitle,
  };
  tab.timeline.push(entry);
  return { entry, triggersSweep: input.triggerSweep ?? true };
}
```

- [ ] **Step 2: Update `src/core/runtime.ts`** — replace `publishSystemMessageToTab`/`publishMessageToTab` with typed functions. Specific changes:
  - `private publishMessage(...)` → calls `publishParticipantMessage(...)`, returns `{ entry: ParticipantMessageEntry; triggersSweep: boolean }`
  - `private publishSystemMessage(...)` → three call sites in the file: `createAgent` (line 233) calls with `participant_joined`, `removeAgent`/update call with `participant_left`, topic change calls with `topic_changed`. Replace each with the typed function: `publishParticipantJoined`, `publishParticipantLeft`, `publishTopicChanged`
  - `async sendMessage(...)` return type: `Promise<ParticipantMessageEntry>`
  - `async sendSystemMessage(...)`: split into `sendParticipantJoined`, `sendParticipantLeft`, `sendTopicChanged` or keep one generic but typed — match what external callers expect (tests call `runtime.sendMessage(...)`)
  - `isMessageVisibleToAgent(message: ChatMessage, ...)` → `isEntryVisibleToAgent(entry: ContextEntry, ...)` (delegates to context-routing)
  - `isMessageVisibleToParticipant(message: ChatMessage, ...)` → `isEntryVisibleToParticipant(entry: ContextEntry, ...)`
  - `sendMessage` in `ExecutionContext` interface (line ~45 of `execution.ts`) → return type `Promise<ParticipantMessageEntry>`

- [ ] **Step 3: Update `src/core/execution.ts`** — 4 `pushRuntimeEvent` calls, replace with per-kind functions:
  - Line 127: `pushRuntimeEvent({ ..., payload: { type: 'silent-decision', ... } })` → `pushSilentDecision({ ..., agentId, reason: result.action.reason, sourceTraceId: traceId, requestCostUsd, ownPromptCostUsd, costUsd: requestCostUsd })`
  - Lines 341, 431, 458: `pushRuntimeEvent({ ..., payload: { type: 'sweep-started' } })` etc. → `pushSweepStarted(...)`, `pushSweepFinished(...)`, `pushSweepStopped(...)`. Check exact types at each site.
  - Line 174: `attachProducedMessageToTrace(traceId, sentMessage.id, tab)` — `sentMessage` was `ChatMessage`, now `ParticipantMessageEntry`. `.id` field stays the same name, so this line needs no change beyond updated type.

- [ ] **Step 4: Update `src/vue/stores/messageInput.ts`** — remove `mentionMessageSender(message: ChatMessage)`. The only public caller `ChatMessageLine.vue` is being deleted. Keep `mentionParticipantById(participantId: string)` which is what new `ParticipantMessageEntry.vue` will call.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "messaging\|runtime\|execution" | head -30
```

- [ ] **Step 6: Commit**

```bash
git add src/core/messaging.ts src/core/runtime.ts src/core/execution.ts src/vue/stores/messageInput.ts
git commit -m "feat: replace publishMessageToTab with typed entry creation functions"
```

---

## Task 3: Core diagnostics — entry creation and index rename

**Files:**

- Modify: `src/core/diagnostics.ts`

`pushRuntimeEvent` creates a `RuntimeEvent` and wraps it in `TimelineTechnicalEventEntry`. Replace with direct entry creation per kind. Rename all `messageInspectionIndex` references.

- [ ] **Step 1: Rewrite `pushRuntimeEvent`** — replace the single generic function with per-kind functions that push entries directly:

```typescript
import type {
  ChatTabState,
  EntryInspectionIndex,
  RuntimeErrorEntry,
  SilentDecisionEntry,
  SweepFinishedEntry,
  SweepStartedEntry,
  SweepStoppedEntry,
  // ... other imports
} from './types';

export function pushSweepStarted(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  agentId?: string;
}): void {
  const entry: SweepStartedEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'sweep-started',
    agentId: input.agentId,
  };
  input.tab.timeline.push(entry);
}

export function pushSweepFinished(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  agentId?: string;
  costUsd?: number;
  requestCostUsd?: number;
  ownPromptCostUsd?: number;
  downstreamPromptCostUsd?: number;
  downstreamPromptCostContributors?: SweepFinishedEntry['downstreamPromptCostContributors'];
}): void {
  const entry: SweepFinishedEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'sweep-finished',
    agentId: input.agentId,
    costUsd: input.costUsd,
    requestCostUsd: input.requestCostUsd,
    ownPromptCostUsd: input.ownPromptCostUsd,
    downstreamPromptCostUsd: input.downstreamPromptCostUsd,
    downstreamPromptCostContributors: input.downstreamPromptCostContributors,
  };
  input.tab.timeline.push(entry);
}

export function pushSweepStopped(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  agentId?: string;
}): void {
  const entry: SweepStoppedEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'sweep-stopped',
    agentId: input.agentId,
  };
  input.tab.timeline.push(entry);
}

export function pushSilentDecision(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  agentId: string;
  reason: string;
  sourceTraceId?: string;
  costUsd?: number;
  requestCostUsd?: number;
  ownPromptCostUsd?: number;
  downstreamPromptCostUsd?: number;
  downstreamPromptCostContributors?: SilentDecisionEntry['downstreamPromptCostContributors'];
}): void {
  const entry: SilentDecisionEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'silent-decision',
    agentId: input.agentId,
    reason: input.reason,
    sourceTraceId: input.sourceTraceId,
    costUsd: input.costUsd,
    requestCostUsd: input.requestCostUsd,
    ownPromptCostUsd: input.ownPromptCostUsd,
    downstreamPromptCostUsd: input.downstreamPromptCostUsd,
    downstreamPromptCostContributors: input.downstreamPromptCostContributors,
  };
  input.tab.timeline.push(entry);
}

export function pushRuntimeError(input: {
  createId: () => string;
  now: () => Date;
  tab: ChatTabState;
  workspace: WorkspaceState;
  payload: Pick<
    RuntimeError,
    'agentId' | 'message' | 'details' | 'sourceTraceId'
  >;
  participantName: (participantId: string, tab: ChatTabState) => string;
}): void {
  input.workspace.errors.push({
    id: input.createId(),
    createdAt: input.now().toISOString(),
    ...input.payload,
  });
  const entry: RuntimeErrorEntry = {
    id: input.createId(),
    createdAt: input.now().toISOString(),
    kind: 'runtime-error',
    agentId: input.payload.agentId ?? '',
    details: input.payload.details ?? input.payload.message,
    sourceTraceId: input.payload.sourceTraceId,
  };
  input.tab.timeline.push(entry);
  // Copy the pushDebugLog call verbatim from the existing pushRuntimeError body in diagnostics.ts
  pushDebugLog({
    now: input.now,
    workspace: input.workspace,
    payload: {
      kind: 'runtime-error',
      sweep: input.tab.execution.sweepCount,
      agentId: input.payload.agentId,
      agentName: input.payload.agentId
        ? input.participantName(input.payload.agentId, input.tab)
        : undefined,
      details: `${input.payload.message}${input.payload.details ? `: ${input.payload.details}` : ''}`,
    },
  });
}
```

- [ ] **Step 2: Rename `getMessageInspectionIndexEntry` → `getEntryInspectionIndexEntry`**, update to use `entryInspectionIndex`:

```typescript
export function getEntryInspectionIndexEntry(
  entryId: string,
  tab: ChatTabState,
): EntryInspectionIndex {
  tab.entryInspectionIndex[entryId] ??= {
    sourceTraceId: undefined,
    downstreamTraceIds: [],
    triggeringTraceIds: [],
    visibleTraceIds: [],
  };
  return tab.entryInspectionIndex[entryId]!;
}
```

- [ ] **Step 3: Rename `updateMessageSourceTrace` → `updateEntrySourceTrace`**, `linkTraceToMessage` → `linkTraceToEntry`, `attachProducedMessageToTrace` stays but calls `getEntryInspectionIndexEntry`. Update `getMessageById` → `getParticipantEntryById` to return `ParticipantMessageEntry | null`. Update `getTimelineMessages` → `getTimelineParticipantEntries` to return `ParticipantMessageEntry[]`:

```typescript
export function getTimelineParticipantEntries(
  tab: ChatTabState,
): ParticipantMessageEntry[] {
  return tab.timeline.filter(
    (entry): entry is ParticipantMessageEntry =>
      entry.kind === 'participant-message',
  );
}

export function findParticipantEntryById(
  entryId: string,
  tab: ChatTabState,
): ParticipantMessageEntry | undefined {
  return tab.timeline.find(
    (entry): entry is ParticipantMessageEntry =>
      entry.kind === 'participant-message' && entry.id === entryId,
  );
}

export function getParticipantEntryById(
  entryId: string,
  tab: ChatTabState,
): ParticipantMessageEntry | null {
  return findParticipantEntryById(entryId, tab) ?? null;
}
```

- [ ] **Step 4: Find all callers of old runtime event functions**

```bash
grep -rn "pushRuntimeEvent\|getMessageInspectionIndexEntry\|linkTraceToMessage\|updateMessageSourceTrace\|getTimelineMessages\|findMessageEntryById\|getMessageById" src/
```

Update each call site.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "diagnostics\|runtime" | head -40
```

- [ ] **Step 6: Commit**

```bash
git add src/core/diagnostics.ts
git commit -m "feat: replace pushRuntimeEvent with per-kind push functions; rename entryInspectionIndex"
```

---

## Task 4: Core context-routing and traces

**Files:**

- Modify: `src/core/context-routing.ts`
- Modify: `src/core/traces.ts`

- [ ] **Step 1: Rewrite `getVisibleContextMessages` in `context-routing.ts`** to return entries visible to agents. Now returns both `ParticipantMessageEntry` and system entries (`ParticipantJoinedEntry | ParticipantLeftEntry | TopicChangedEntry`):

```typescript
type ContextEntry =
  | ParticipantMessageEntry
  | ParticipantJoinedEntry
  | ParticipantLeftEntry
  | TopicChangedEntry;

export function getVisibleContextEntries(tab: ChatTabState): ContextEntry[] {
  const cutoffIndex = getActiveManualCutoffIndex(tab);
  const source =
    cutoffIndex === null ? tab.timeline : tab.timeline.slice(cutoffIndex + 1);

  return source.filter(
    (entry): entry is ContextEntry =>
      entry.kind === 'participant-message' ||
      entry.kind === 'participant-joined' ||
      entry.kind === 'participant-left' ||
      entry.kind === 'topic-changed',
  );
}
```

- [ ] **Step 2: Rewrite `isMessageVisibleToAgent`** to work with `ParticipantMessageEntry` (only participant messages have `target`/`recipientId`; system events are always public):

```typescript
export function isEntryVisibleToAgent(
  entry: ContextEntry,
  agentId: string,
): boolean {
  if (entry.kind !== 'participant-message') return true; // system events always visible
  if (entry.target === 'public') return true;
  return entry.authorId === agentId || entry.recipientId === agentId;
}
```

- [ ] **Step 3: Rewrite `getVisibleMessagesForAgent`** to build `AgentContextMessage[]` from new entry types:

```typescript
function systemEventContent(
  entry: ParticipantJoinedEntry | ParticipantLeftEntry | TopicChangedEntry,
): string {
  switch (entry.kind) {
    case 'participant-joined':
      return `${entry.participantName} joined the chat`;
    case 'participant-left':
      return `${entry.participantName} left the chat`;
    case 'topic-changed':
      return `Topic changed to: ${entry.topicTitle}`;
  }
}

export function getVisibleMessagesForAgent(
  agentId: string,
  tab: ChatTabState,
): AgentContextMessage[] {
  return getVisibleContextEntries(tab)
    .filter((entry) => isEntryVisibleToAgent(entry, agentId))
    .map((entry) => {
      if (entry.kind === 'participant-message') {
        const sender = tab.participants.find((p) => p.id === entry.authorId);
        const recipient = tab.participants.find(
          (p) => p.id === entry.recipientId,
        );
        return {
          id: entry.id,
          authorType: 'participant' as const,
          senderId: entry.authorId,
          senderName: sender?.name ?? entry.authorId,
          target: entry.target,
          recipientId: entry.recipientId,
          recipientName: recipient?.name,
          content: entry.content,
          createdAt: entry.createdAt,
        };
      }
      return {
        id: entry.id,
        authorType: 'system' as const,
        senderName: 'System',
        target: 'public' as const,
        content: systemEventContent(entry),
        createdAt: entry.createdAt,
      };
    });
}
```

- [ ] **Step 4: Update `getNonSelfVisibleMessageIds`, `getVisibleContextKey`, etc.** to call `getVisibleMessagesForAgent` (no structural change needed beyond renamed deps).

- [ ] **Step 5: Update `isMessageVisibleToParticipant`** for participant visibility filtering in timeline:

```typescript
export function isEntryVisibleToParticipant(
  entry: ContextEntry,
  participantId: string,
): boolean {
  if (entry.kind !== 'participant-message') return true;
  if (entry.target === 'public') return true;
  return (
    participantId === DEFAULT_HUMAN.id ||
    entry.authorId === participantId ||
    entry.recipientId === participantId
  );
}
```

- [ ] **Step 6: Update `traces.ts`** — rename `tab.messageInspectionIndex` → `tab.entryInspectionIndex` in `getRelatedRequestTraces` (line 26–32) and `getMessageInspectionGraph`. Update `getMessageById` calls to `getParticipantEntryById`. Rename result fields:

In `getInspectionSubjectForMessage` and `getMessageInspectionGraph`, update the return type to use `ParticipantMessageEntry` instead of `ChatMessage`:

```typescript
// return type of getInspectionSubjectForMessage:
{
  entry: ParticipantMessageEntry | null; // was: message
  sourceTrace: RequestTrace | null;
  // ... rest unchanged
}
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "context-routing\|traces" | head -30
```

- [ ] **Step 8: Commit**

```bash
git add src/core/context-routing.ts src/core/traces.ts
git commit -m "feat: update context-routing and traces for new entry types"
```

---

## Task 5: Vue types and timeline utils

**Files:**

- Modify: `src/vue/types.ts`
- Modify: `src/vue/utils/timeline.ts`
- Modify: `src/vue/utils/chatFormatting.ts`

- [ ] **Step 1: Rewrite `src/vue/types.ts`** — replace `VisibleTimelineMessageEntry`/`VisibleTimelineTechnicalEventEntry` with a simple augmentation:

```typescript
import type {
  AgentConfig,
  ChatEntry,
  TimelineHistoryCutoffEntry,
  ParticipantMessageEntry,
} from '../core';

export type CostDisplayMode = 'off' | 'request' | 'net';

export interface ChatViewPreferences {
  showSilentDecisions: boolean;
  costDisplayMode: CostDisplayMode;
}

// All ChatEntry kinds get isMuted; HistoryCutoffEntry does not.
export type VisibleChatEntry = ChatEntry & { isMuted: boolean };
// HistoryCutoffEntry gets sortAt for ordering but not isMuted.
export type VisibleHistoryCutoffEntry = TimelineHistoryCutoffEntry & {
  sortAt: number;
};
export type VisibleTimelineEntry = VisibleChatEntry | VisibleHistoryCutoffEntry;

// CostTrackedItem now references ChatEntryBase fields directly
export type CostTrackedItem = {
  costUsd?: number;
  requestCostUsd?: number;
  ownPromptCostUsd?: number;
  downstreamPromptCostUsd?: number;
  downstreamPromptCostContributors?: Array<{
    agentId: string;
    promptCostUsd: number;
    listenCount: number;
  }>;
};

// Leave RenderedTab, RenderedParticipant, RenderedAgent exactly as-is from the current file.
```

- [ ] **Step 2: Rewrite `buildVisibleTimelineEntries` in `src/vue/utils/timeline.ts`** — handle all 9 `ChatEntry` kinds plus `history-cutoff`:

```typescript
import type { TimelineEntry } from '../../core';
import type { ChatViewPreferences, VisibleTimelineEntry } from '../types';

export function buildVisibleTimelineEntries(input: {
  runtime: MultiChatRuntime;
  state: RuntimeState;
  participantId: string;
  preferences: Pick<ChatViewPreferences, 'showSilentDecisions'>;
}): VisibleTimelineEntry[] {
  const activeManualCutoffIndex = getActiveManualCutoffIndex(
    input.state.timeline,
  );
  const visibleEntries: VisibleTimelineEntry[] = [];

  for (const [index, entry] of input.state.timeline.entries()) {
    const sortAt = index * 2;
    const isMuted =
      activeManualCutoffIndex !== null && index < activeManualCutoffIndex;

    if (entry.kind === 'history-cutoff') {
      visibleEntries.push({ ...entry, sortAt });
      continue;
    }

    if (
      entry.kind === 'silent-decision' ||
      entry.kind === 'sweep-started' ||
      entry.kind === 'sweep-finished' ||
      entry.kind === 'sweep-stopped'
    ) {
      if (!input.preferences.showSilentDecisions) continue;
    }

    if (entry.kind === 'participant-message') {
      if (
        !input.runtime.isEntryVisibleToParticipant(entry, input.participantId)
      ) {
        continue;
      }
    }

    visibleEntries.push({ ...entry, sortAt, isMuted });
  }

  return visibleEntries.sort(compareVisibleTimelineEntries);
}

function compareVisibleTimelineEntries(
  left: VisibleTimelineEntry,
  right: VisibleTimelineEntry,
): number {
  const leftSort = (left as { sortAt: number }).sortAt;
  const rightSort = (right as { sortAt: number }).sortAt;
  if (leftSort !== rightSort) return leftSort - rightSort;

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
  };

  return priority[left.kind] - priority[right.kind];
}
```

- [ ] **Step 3: Update `src/vue/utils/chatFormatting.ts`** — remove `ChatMessage`/`RuntimeEvent` formatters that are no longer used by any component. Keep `formatMessageTime` and `formatDebugLogLine`. Add entry-specific formatters:

```typescript
// Keep:
export function formatMessageTime(createdAt: string): string { ... }
export function formatDebugLogLine(entry: DebugLogEntry): string { ... }

// Remove (no longer called from components after new entry components):
// formatMessageAuthor, isSystemMessage, formatTechnicalEventLabel,
// formatTechnicalEventText, technicalEventClasses

// Add:
export function formatParticipantName(
  authorId: string,
  target: 'public' | 'private',
  recipientId: string | undefined,
  lookup: ParticipantNameLookup,
): string {
  const sender = lookup.byId(authorId) ?? authorId;
  if (target === 'private') {
    const recipient = recipientId ? (lookup.byId(recipientId) ?? recipientId) : 'all';
    return `<${sender} -> ${recipient}>`;
  }
  return `<${sender}>`;
}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "vue/types\|timeline\|chatFormatting" | head -30
```

- [ ] **Step 5: Commit**

```bash
git add src/vue/types.ts src/vue/utils/timeline.ts src/vue/utils/chatFormatting.ts
git commit -m "feat: update Vue types and timeline utils for unified ChatEntry"
```

---

## Task 6: Vue stores

**Files:**

- Modify: `src/vue/stores/timeline.ts`
- Modify: `src/vue/stores/inspection.ts`

- [ ] **Step 1: Update `src/vue/stores/timeline.ts`** — remove `canInspectEvent` (no longer needed; inspection is per entry type), remove `RuntimeEvent` import. Add `mutedEntryIds` for composable use:

```typescript
import { defineStore, storeToRefs } from 'pinia';
import { computed } from 'vue';
import type { MultiChatRuntime } from '../../core';
import type {
  ChatViewPreferences,
  VisibleChatEntry,
  VisibleTimelineEntry,
} from '../types';
import { buildVisibleTimelineEntries } from '../utils/timeline';
import { usePreferencesStore } from './preferences';
import { useRuntimeStore } from './runtime';

export const useTimelineStore = defineStore('timeline', () => {
  const runtimeStore = useRuntimeStore();
  const preferencesStore = usePreferencesStore();
  const { state } = storeToRefs(runtimeStore);
  const runtime = computed<MultiChatRuntime>(() =>
    runtimeStore.requireRuntime(),
  );

  const preferences = computed<ChatViewPreferences>(() => ({
    showSilentDecisions: preferencesStore.showSilentDecisions,
    costDisplayMode: preferencesStore.costDisplayMode,
  }));

  const humanParticipant = computed(
    () => state.value.participants.find((p) => p.role === 'human') ?? null,
  );

  const visibleTimelineEntries = computed<VisibleTimelineEntry[]>(() =>
    buildVisibleTimelineEntries({
      runtime: runtime.value,
      state: state.value,
      participantId: humanParticipant.value?.id ?? 'human',
      preferences: preferences.value,
    }),
  );

  // Set of entry IDs that are muted (before active cutoff). Used by useEntryMuted composable.
  const mutedEntryIds = computed<Set<string>>(() => {
    const muted = new Set<string>();
    for (const entry of visibleTimelineEntries.value) {
      if ('isMuted' in entry && entry.isMuted) muted.add(entry.id);
    }
    return muted;
  });

  function participantNameById(participantId: string): string | null {
    return (
      state.value.participants.find((p) => p.id === participantId)?.name ?? null
    );
  }

  return {
    state,
    preferences,
    humanParticipant,
    visibleTimelineEntries,
    mutedEntryIds,
    participantNameById,
  };
});
```

- [ ] **Step 2: Rewrite `src/vue/stores/inspection.ts`** — `ChatMessage` → `ParticipantMessageEntry`, `messageInspectionIndex` → `entryInspectionIndex`:

```typescript
import { defineStore, storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AgentConfig,
  ParticipantMessageEntry,
  RequestTrace,
  RuntimeState,
} from '../../core';
import type { AgentToolCall } from '../../core/types';
import { useDiagnosticsStore } from './diagnostics';
import { useRuntimeStore } from './runtime';
import { useUiStore } from './ui';

export const useInspectionStore = defineStore('inspection', () => {
  const runtimeStore = useRuntimeStore();
  const diagnosticsStore = useDiagnosticsStore();
  const ui = useUiStore();
  const { state } = storeToRefs(runtimeStore);
  const { diagnostics } = storeToRefs(diagnosticsStore);

  const inspectionHistory = ref<string[]>([]);
  const inspectionHistoryIndex = ref(0);

  const canGoBack = computed(() => inspectionHistoryIndex.value > 0);
  const canGoForward = computed(
    () => inspectionHistoryIndex.value < inspectionHistory.value.length - 1,
  );

  const currentInspectedEntry = computed<ParticipantMessageEntry | null>(() => {
    const entryId = inspectionHistory.value[inspectionHistoryIndex.value];
    if (!entryId) return null;
    return findParticipantEntryById(state.value, entryId);
  });

  const traceForCurrentEntry = computed<RequestTrace | null>(() => {
    const entry = currentInspectedEntry.value;
    if (!entry?.sourceTraceId) return null;
    return diagnostics.value.requestTraces[entry.sourceTraceId] ?? null;
  });

  const agentForCurrentEntry = computed<AgentConfig | null>(() => {
    const trace = traceForCurrentEntry.value;
    if (!trace) return null;
    return state.value.agents.find((a) => a.id === trace.agentId) ?? null;
  });

  const contextEntriesForCurrentTrace = computed<ParticipantMessageEntry[]>(
    () => {
      const trace = traceForCurrentEntry.value;
      if (!trace) return [];
      return trace.visibleMessageIds
        .map((id) => findParticipantEntryById(state.value, id))
        .filter((e): e is ParticipantMessageEntry => e !== null);
    },
  );

  const currentActionForTrace = computed<AgentToolCall | null>(() => {
    const payload = traceForCurrentEntry.value?.payloads.normalizedActionJson;
    if (!payload || typeof payload !== 'object') return null;
    return payload as AgentToolCall;
  });

  const usedInEntriesForCurrentEntry = computed<ParticipantMessageEntry[]>(
    () => {
      const entryId = currentInspectedEntry.value?.id;
      if (!entryId) return [];
      const index = diagnostics.value.entryInspectionIndex[entryId];
      if (!index) return [];
      return index.downstreamTraceIds
        .map((traceId) => diagnostics.value.requestTraces[traceId])
        .filter(Boolean)
        .map((trace) =>
          trace.producedMessageId
            ? findParticipantEntryById(state.value, trace.producedMessageId)
            : null,
        )
        .filter((e): e is ParticipantMessageEntry => e !== null);
    },
  );

  function openForEntry(entryId: string): void {
    inspectionHistory.value = [entryId];
    inspectionHistoryIndex.value = 0;
    ui.showRequestInspection = true;
    ui.activeInspectionTab = 'participant';
  }

  function navigateTo(entryId: string): void {
    inspectionHistory.value = inspectionHistory.value.slice(
      0,
      inspectionHistoryIndex.value + 1,
    );
    inspectionHistory.value.push(entryId);
    inspectionHistoryIndex.value = inspectionHistory.value.length - 1;
    if (!ui.showRequestInspection) ui.showRequestInspection = true;
  }

  function navigateBack(): void {
    if (canGoBack.value) inspectionHistoryIndex.value--;
  }

  function navigateForward(): void {
    if (canGoForward.value) inspectionHistoryIndex.value++;
  }

  function reset(): void {
    inspectionHistory.value = [];
    inspectionHistoryIndex.value = 0;
  }

  function close(): void {
    ui.showRequestInspection = false;
  }

  function participantName(participantId?: string): string {
    if (!participantId) return '';
    return (
      state.value.participants.find((p) => p.id === participantId)?.name ??
      participantId
    );
  }

  return {
    inspectionHistory,
    inspectionHistoryIndex,
    canGoBack,
    canGoForward,
    currentInspectedEntry,
    traceForCurrentEntry,
    agentForCurrentEntry,
    contextEntriesForCurrentTrace,
    currentActionForTrace,
    usedInEntriesForCurrentEntry,
    openForEntry,
    navigateTo,
    navigateBack,
    navigateForward,
    reset,
    close,
    participantName,
  };
});

function findParticipantEntryById(
  state: RuntimeState,
  entryId: string,
): ParticipantMessageEntry | null {
  for (const entry of state.timeline) {
    if (entry.kind === 'participant-message' && entry.id === entryId) {
      return entry;
    }
  }
  return null;
}
```

- [ ] **Step 3: Update all call sites of renamed inspection store fields**

```bash
grep -rn "openForMessage\|canInspectMessage\|currentInspectedMessage\|traceForCurrentMessage\|agentForCurrentMessage\|contextMessagesForCurrentTrace\|usedInMessagesForCurrentMessage" src/vue/
```

Known locations:

- `src/vue/components/RequestInspectionModal.vue` line 232: `agentForCurrentMessage: agent` → `agentForCurrentEntry: agent`
- `src/vue/components/RequestInspectionModal.vue`: any reference to `currentInspectedMessage`, `contextMessagesForCurrentTrace`, `usedInMessagesForCurrentMessage` → rename to `currentInspectedEntry`, `contextEntriesForCurrentTrace`, `usedInEntriesForCurrentEntry`
- Any component that calls `inspection.openForMessage(id)` → `inspection.openForEntry(id)`
- `TechnicalEventEntry.vue` calls `inspection.openForMessage(message.id)` but this file is deleted in Task 10, so no action needed here

Update each remaining call site.

- [ ] **Step 4: Delete the two system-message inspection tests** in `tests/vue/components/multi-agent-chat/inspection.test.ts`:

  Remove the two `it(...)` blocks at lines 380–408:
  - `'system message timestamp is inspectable (active trigger)'` (lines 380–393)
  - `'shows System label on Participant tab for a system message'` (lines 395–408)

  Reason: system events (`ParticipantJoinedEntry` etc.) are not inspectable in the new model — they have no `sourceTraceId` and no timestamp click handler.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "stores" | head -30
```

- [ ] **Step 6: Commit**

```bash
git add src/vue/stores/timeline.ts src/vue/stores/inspection.ts src/vue/components/RequestInspectionModal.vue tests/vue/components/multi-agent-chat/inspection.test.ts
git commit -m "feat: update timeline and inspection stores for unified ChatEntry"
```

---

## Task 7: Entry composables

**Files:**

- Create: `src/vue/composables/useEntryInspection.ts`
- Create: `src/vue/composables/useEntryCost.ts`

These are the shared-behaviour building blocks each entry component uses.

- [ ] **Step 1: Create `src/vue/composables/useEntryInspection.ts`**

Two exported composables: one for participant messages (directly inspectable), one for technical entries (navigate to the associated participant message via shared trace).

```typescript
import type { ChatEntry, ParticipantMessageEntry } from '../../core';
import { useInspectionStore } from '../stores/inspection';
import { useTimelineStore } from '../stores/timeline';

// For ParticipantMessageEntry — always inspectable; clicking opens inspector for this entry.
export function useEntryInspection(entry: ParticipantMessageEntry) {
  const inspection = useInspectionStore();

  // All participant messages are inspectable.
  const canInspect = true;

  function handleInspectClick(event?: Event): void {
    event?.stopPropagation();
    inspection.openForEntry(entry.id);
  }

  return { canInspect, handleInspectClick };
}
```

For technical entries that navigate to their associated participant message (like old `TechnicalEventEntry` did):

```typescript
// For SilentDecisionEntry / RuntimeErrorEntry — inspectable only if they have a sourceTraceId.
// Clicking navigates to the participant message that was produced by the same trace.
export function useEntryInspectionByTrace(entry: { sourceTraceId?: string }) {
  const inspection = useInspectionStore();
  const timeline = useTimelineStore();

  const canInspect = Boolean(entry.sourceTraceId);

  function handleInspectClick(): void {
    if (!entry.sourceTraceId) return;
    const traceId = entry.sourceTraceId;
    const target = timeline.state.timeline.find(
      (e): e is ParticipantMessageEntry =>
        e.kind === 'participant-message' && e.sourceTraceId === traceId,
    );
    if (target) inspection.openForEntry(target.id);
  }

  return { canInspect, handleInspectClick };
}
```

- [ ] **Step 2: Create `src/vue/composables/useEntryCost.ts`**

Provides cost display logic for entry components:

```typescript
import { computed } from 'vue';
import type { ChatEntry } from '../../core';
import { usePreferencesStore } from '../stores/preferences';
import { shouldShowMessageCost } from '../utils/costing';

export function useEntryCost(entry: ChatEntry) {
  const preferences = usePreferencesStore();
  const costDisplayMode = computed(() => preferences.costDisplayMode);
  const showCost = computed(() =>
    shouldShowMessageCost(entry, costDisplayMode.value),
  );
  return { costDisplayMode, showCost };
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "composables" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/vue/composables/useEntryInspection.ts src/vue/composables/useEntryCost.ts
git commit -m "feat: add useEntryInspection and useEntryCost composables"
```

---

## Task 8: New entry components

**Files:**

- Create: `src/vue/components/timeline/entries/` (9 components)

Each component receives a `VisibleChatEntry` of its specific kind and is fully free in layout. All preserve the `data-manual-cutoff-drop-target` and `data-timeline-entry-id` data attributes for the drag system. Use `useCutoffDrag` to get `dragPreviewTargetId`.

- [ ] **Step 1: Create `src/vue/components/timeline/entries/ParticipantMessageEntry.vue`**

This replaces `MessageEntry.vue` + `ChatMessageLine.vue`. Preserves `.chat-line-time-active` class (needed by tests).

```vue
<template>
  <article
    class="entry-article"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <div class="chat-line" :class="lineClasses">
      <span
        class="chat-line-time"
        :class="{ 'chat-line-time-active': true }"
        role="button"
        tabindex="0"
        @click="handleInspectClick"
        @keydown.enter="handleInspectClick"
        @keydown.space.prevent="handleInspectClick"
        >[{{ timeLabel }}]</span
      >{{ ' '
      }}<span
        class="chat-line-sender"
        :class="{ 'chat-line-sender-interactive': true }"
        @dblclick="handleMention"
        >{{ authorLabel }}</span
      ><template v-if="showCost.value"
        >{{ ' '
        }}<CostBadge
          :item="entry"
          :item-id="entry.id"
          :cost-display-mode="costDisplayMode.value" /></template
      >{{ ' ' }}<span class="chat-line-text">{{ entry.content }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ParticipantMessageEntry } from '../../../../core';
import { useCutoffDrag } from '../../../composables/useCutoffDrag';
import { useEntryInspection } from '../../../composables/useEntryInspection';
import { useEntryCost } from '../../../composables/useEntryCost';
import { useMessageInputStore } from '../../../stores/messageInput';
import { useTimelineStore } from '../../../stores/timeline';
import {
  formatMessageTime,
  formatParticipantName,
} from '../../../utils/chatFormatting';
import CostBadge from '../CostBadge.vue';

const props = defineProps<{
  entry: ParticipantMessageEntry & { isMuted: boolean };
}>();

const drag = useCutoffDrag();
const dragPreviewTargetId = drag.dragPreviewTargetId;
const messageInput = useMessageInputStore();
const timeline = useTimelineStore();

const { handleInspectClick } = useEntryInspection(props.entry);
const { showCost, costDisplayMode } = useEntryCost(props.entry);

const timeLabel = computed(() => formatMessageTime(props.entry.createdAt));

const authorLabel = computed(() =>
  formatParticipantName(
    props.entry.authorId,
    props.entry.target,
    props.entry.recipientId,
    { byId: timeline.participantNameById },
  ),
);

const lineClasses = computed(() => ({
  'chat-line-private': props.entry.target === 'private',
  'chat-line-muted': props.entry.isMuted,
}));

function handleMention(): void {
  messageInput.mentionParticipantById(props.entry.authorId);
}
</script>

<style scoped>
@reference "../../../../styles.css";

.entry-article {
  @apply relative;
}

.chat-line {
  @apply block break-words text-[13px] leading-6 text-neutral-800;
}

.chat-line-private {
  @apply italic text-orange-700;
}

.chat-line-muted {
  @apply text-neutral-500;
}

.chat-line-time {
  @apply inline text-neutral-500;
}

.chat-line-time-active {
  @apply cursor-pointer rounded transition-colors hover:bg-neutral-200/80;
}

.chat-line-sender {
  @apply whitespace-nowrap rounded font-semibold text-neutral-700;
}

.chat-line-sender-interactive {
  @apply cursor-pointer transition-colors hover:bg-neutral-200/80;
}

.chat-line-text {
  @apply text-current;
}

[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
```

Note: `mentionById` may not exist yet on `messageInput` store — check and adapt.

- [ ] **Step 2: Create system event entries** — `ParticipantJoinedEntry.vue`, `ParticipantLeftEntry.vue`, `TopicChangedEntry.vue`. These are simple text-only lines with no sender:

```vue
<!-- ParticipantJoinedEntry.vue -->
<template>
  <article
    class="entry-article"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <div class="system-line" :class="{ 'chat-line-muted': entry.isMuted }">
      <span class="chat-line-time">[{{ timeLabel }}]</span>{{ ' '
      }}<span class="system-text"
        >{{ entry.participantName }} joined the chat</span
      >
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ParticipantJoinedEntry } from '../../../../core';
import { useCutoffDrag } from '../../../composables/useCutoffDrag';
import { formatMessageTime } from '../../../utils/chatFormatting';

const props = defineProps<{
  entry: ParticipantJoinedEntry & { isMuted: boolean };
}>();
const drag = useCutoffDrag();
const dragPreviewTargetId = drag.dragPreviewTargetId;
const timeLabel = computed(() => formatMessageTime(props.entry.createdAt));
</script>

<style scoped>
@reference "../../../../styles.css";
.entry-article {
  @apply relative;
}
.system-line {
  @apply block text-[13px] leading-6 text-neutral-500;
}
.chat-line-time {
  @apply text-neutral-500;
}
.system-text {
  @apply italic;
}
.chat-line-muted {
  @apply opacity-50;
}
[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
```

Create `ParticipantLeftEntry.vue` and `TopicChangedEntry.vue` following the same pattern (adjust text).

- [ ] **Step 3: Create technical event entries** — `SilentDecisionEntry.vue` and `RuntimeErrorEntry.vue`. These replace `TechnicalEventEntry.vue`, split by kind. Preserve `.runtime-line-silent` and `.runtime-line-error` classes:

```vue
<!-- SilentDecisionEntry.vue -->
<template>
  <article
    class="entry-article"
    data-manual-cutoff-drop-target="true"
    :data-timeline-entry-id="entry.id"
    :data-cutoff-drop-active="dragPreviewTargetId === entry.id"
  >
    <div class="runtime-line runtime-line-silent">
      <button
        type="button"
        class="message-time message-time-trigger"
        :class="{ 'message-time-trigger-active': canInspect }"
        :disabled="!canInspect"
        @click="handleInspectClick"
      >
        [{{ timeLabel }}]</button
      >{{ ' ' }}<span class="runtime-label">{{ label }}</span
      ><template v-if="showCost.value"
        >{{ ' '
        }}<CostBadge
          :item="entry"
          :item-id="entry.id"
          :cost-display-mode="costDisplayMode.value" /></template
      >{{ ' '
      }}<span class="runtime-text">stayed silent: {{ entry.reason }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SilentDecisionEntry } from '../../../../core';
import { useCutoffDrag } from '../../../composables/useCutoffDrag';
import { useEntryInspectionByTrace } from '../../../composables/useEntryInspection';
import { useEntryCost } from '../../../composables/useEntryCost';
import { useTimelineStore } from '../../../stores/timeline';
import { formatMessageTime } from '../../../utils/chatFormatting';
import CostBadge from '../CostBadge.vue';

const props = defineProps<{
  entry: SilentDecisionEntry & { isMuted: boolean };
}>();
const drag = useCutoffDrag();
const dragPreviewTargetId = drag.dragPreviewTargetId;
const timeline = useTimelineStore();
const { canInspect, handleInspectClick } = useEntryInspectionByTrace(
  props.entry,
);
const { showCost, costDisplayMode } = useEntryCost(props.entry);
const timeLabel = computed(() => formatMessageTime(props.entry.createdAt));
const label = computed(() => {
  const name = timeline.participantNameById(props.entry.agentId);
  return name ? `[silent ${name}]` : '[silent]';
});
</script>

<style scoped>
@reference "../../../../styles.css";
.entry-article {
  @apply relative;
}
.runtime-line {
  @apply block break-words text-[13px] leading-6;
}
.runtime-line-silent {
  @apply text-sky-800;
}
.runtime-label {
  @apply font-semibold text-sky-900;
}
.runtime-text {
  @apply whitespace-pre-wrap text-current;
}
.message-time {
  @apply text-neutral-500;
}
.message-time-trigger {
  @apply cursor-default border-0 bg-transparent p-0 text-current;
}
.message-time-trigger-active {
  @apply cursor-pointer rounded transition-colors hover:bg-neutral-200/80;
}
[data-cutoff-drop-active='true']::before {
  content: '';
  @apply absolute left-0 right-0 top-[-2px] border-t-2 border-amber-500;
}
</style>
```

Create `RuntimeErrorEntry.vue` the same way with `runtime-line-error` classes and error-specific labels.

- [ ] **Step 4: Create sweep event entries** — `SweepStartedEntry.vue`, `SweepFinishedEntry.vue`, `SweepStoppedEntry.vue`. These are similar to silent/error but simpler (no inspect click, no cost on started/stopped). Check `TechnicalEventEntry.vue` for existing styles.

`SweepFinishedEntry.vue` shows cost (it aggregates sweep-level cost).

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck 2>&1 | head -40
```

- [ ] **Step 6: Commit**

```bash
git add src/vue/components/timeline/entries/ src/vue/composables/
git commit -m "feat: add entry components and composables for all ChatEntry kinds"
```

---

## Task 9: Registry and ChatTimeline

**Files:**

- Create: `src/vue/components/timeline/entryRegistry.ts`
- Modify: `src/vue/components/ChatTimeline.vue`

- [ ] **Step 1: Create `src/vue/components/timeline/entryRegistry.ts`**

```typescript
import type { Component } from 'vue';
import type { ChatEntry } from '../../../core';
import ParticipantMessageEntry from './entries/ParticipantMessageEntry.vue';
import ParticipantJoinedEntry from './entries/ParticipantJoinedEntry.vue';
import ParticipantLeftEntry from './entries/ParticipantLeftEntry.vue';
import TopicChangedEntry from './entries/TopicChangedEntry.vue';
import SilentDecisionEntry from './entries/SilentDecisionEntry.vue';
import RuntimeErrorEntry from './entries/RuntimeErrorEntry.vue';
import SweepStartedEntry from './entries/SweepStartedEntry.vue';
import SweepFinishedEntry from './entries/SweepFinishedEntry.vue';
import SweepStoppedEntry from './entries/SweepStoppedEntry.vue';

export const entryRegistry: Record<ChatEntry['kind'], Component> = {
  'participant-message': ParticipantMessageEntry,
  'participant-joined': ParticipantJoinedEntry,
  'participant-left': ParticipantLeftEntry,
  'topic-changed': TopicChangedEntry,
  'silent-decision': SilentDecisionEntry,
  'runtime-error': RuntimeErrorEntry,
  'sweep-started': SweepStartedEntry,
  'sweep-finished': SweepFinishedEntry,
  'sweep-stopped': SweepStoppedEntry,
};
```

- [ ] **Step 2: Rewrite `src/vue/components/ChatTimeline.vue`**

```vue
<template>
  <div
    class="timeline-root"
    :class="{ 'timeline-root--dragging': drag.isDragging.value }"
  >
    <template v-for="entry in renderedTimelineEntries" :key="entry.id">
      <ManualCutoffBanner
        v-if="entry.kind === 'history-cutoff'"
        :entry="entry"
        :dragged-cutoff-id="drag.draggedCutoffId.value"
        :drag-preview-target-id="drag.dragPreviewTargetId.value"
      />
      <component v-else :is="entryRegistry[entry.kind]" :entry="entry" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useCutoffDrag } from '../composables/useCutoffDrag';
import { useTimelineStore } from '../stores/timeline';
import ManualCutoffBanner from './timeline/ManualCutoffBanner.vue';
import { entryRegistry } from './timeline/entryRegistry';

const timelineStore = useTimelineStore();
const { visibleTimelineEntries } = storeToRefs(timelineStore);
const drag = useCutoffDrag();

const renderedTimelineEntries = computed(() =>
  drag.reorderEntriesForDrag(
    visibleTimelineEntries.value,
    drag.draggedCutoffId.value,
    drag.dragPreviewTargetId.value,
  ),
);

onBeforeUnmount(() => {
  drag.stopDrag();
});
</script>

<style scoped>
@reference "../../styles.css";

.timeline-root {
  @apply whitespace-pre-wrap;
}

.timeline-root--dragging {
  @apply cursor-grabbing select-none;
}
</style>
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck 2>&1 | head -40
npm test 2>&1 | tail -40
```

- [ ] **Step 4: Commit**

```bash
git add src/vue/components/ChatTimeline.vue src/vue/components/timeline/entryRegistry.ts
git commit -m "feat: dispatch timeline rendering via entry registry"
```

---

## Task 10: Cleanup

**Files:**

- Delete: `src/vue/components/timeline/MessageEntry.vue`
- Delete: `src/vue/components/timeline/TechnicalEventEntry.vue`
- Delete: `src/vue/components/timeline/ChatMessageLine.vue`
- Modify: `src/core/types.ts` — remove `ChatMessage`, `RuntimeEvent`, `TimelineMessageEntry`, `TimelineTechnicalEventEntry`, `MessageInspectionIndex`, `ChatMessageKind`, `ChatMessageAuthor`, `SystemMessagePayload`, `SystemMessageType`, `RuntimeEventType`, `SendSystemMessageInput`
- Modify: `src/core/messages.ts` — audit; remove anything that only served `ChatMessage`
- Modify: `tests/vue/components/multi-agent-chat/helpers.ts` — remove `ChatMessage`/`TimelineMessageEntry` imports

- [ ] **Step 1: Delete old components**

```bash
rm src/vue/components/timeline/MessageEntry.vue
rm src/vue/components/timeline/TechnicalEventEntry.vue
rm src/vue/components/timeline/ChatMessageLine.vue
```

- [ ] **Step 2: Remove old types from `types.ts`**

Remove: `ChatMessage`, `RuntimeEvent`, `TimelineMessageEntry`, `TimelineTechnicalEventEntry`, `MessageInspectionIndex`, `ChatMessageKind`, `ChatMessageAuthor`, `SystemMessagePayload`, `SystemMessageType`, `RuntimeEventType`, `SendMessageInput`, `SendSystemMessageInput`.

Keep: everything else. Use TypeScript errors to catch any remaining usages.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck 2>&1 | head -60
```

Fix any remaining references to deleted types.

- [ ] **Step 4: Update `tests/vue/components/multi-agent-chat/helpers.ts`** — remove imports of `ChatMessage` and `TimelineMessageEntry`. Update any test helpers that return or work with these types.

- [ ] **Step 5: Run all tests**

```bash
npm test 2>&1 | tail -60
```

All tests should pass. If any test references `.chat-line-time-active` — that class is preserved in `ParticipantMessageEntry.vue` so those should work.

If the inspection tests fail due to renamed store methods (`openForMessage` → `openForEntry`, `currentInspectedMessage` → `currentInspectedEntry`), update the relevant components that call those methods (look at the inspector panel components).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete unified ChatEntry migration — remove legacy wrapper types"
```

---

## Task 11: Verify

- [ ] **Step 1: Run full test suite and typecheck**

```bash
npm run typecheck && npm test
```

Expected: 0 typecheck errors, all tests pass.

- [ ] **Step 2: Start dev server and manually verify**

```bash
npm run dev
```

Verify:

- Chat messages render correctly
- System events (join/leave) render as text lines with no sender
- Silent decisions render with `[silent AgentName]` label
- Runtime errors render with `[error AgentName]` label
- Clicking a message timestamp opens the inspector
- Clicking a silent/error event timestamp navigates to the associated participant message
- Cost badges display correctly
- History cutoff drag still works
- Manual cutoff mutes entries before it (grayed out)

- [ ] **Step 3: Tag completion**

```bash
git tag unified-timeline-entries-complete
```
