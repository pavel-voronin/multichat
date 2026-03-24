# Unified Timeline Entries Design

**Date:** 2026-03-24
**Status:** Approved

## Problem

The timeline has two parallel type branches — `TimelineMessageEntry` (wrapping `ChatMessage`) and `TimelineTechnicalEventEntry` (wrapping `RuntimeEvent`) — with diverging rendering components. Adding a new entry type requires touching multiple layers. Even the "chrome" (sender display, brackets) differs per type, so no single wrapper captures shared structure.

## Goal

One ID space, one rendering mechanism, difference only at the data level. Each timeline entry kind is a first-class discriminated union member rendered by its own registered component.

## Data Model

### `ChatEntry` — unified discriminated union

All timeline entries except `HistoryCutoffEntry` become members of `ChatEntry`:

```typescript
type ChatEntry =
  | ParticipantMessageEntry   // kind: 'participant-message'
  | ParticipantJoinedEntry    // kind: 'participant-joined'
  | ParticipantLeftEntry      // kind: 'participant-left'
  | TopicChangedEntry         // kind: 'topic-changed'
  | SilentDecisionEntry       // kind: 'silent-decision'
  | RuntimeErrorEntry         // kind: 'runtime-error'
  | SweepStartedEntry         // kind: 'sweep-started'
  | SweepFinishedEntry        // kind: 'sweep-finished'
  | SweepStoppedEntry         // kind: 'sweep-stopped'

type TimelineEntry = ChatEntry | HistoryCutoffEntry
```

### Shared base

```typescript
interface ChatEntryBase {
  id: string
  createdAt: string
  sourceTraceId?: string
  // Cost fields are meaningful only on entries that have cost data;
  // other entry kinds carry these as undefined.
  costUsd?: number
  requestCostUsd?: number
  ownPromptCostUsd?: number
  downstreamPromptCostUsd?: number
  downstreamPromptCostContributors?: Array<{
    agentId: string
    promptCostUsd: number
    listenCount: number
  }>
}
```

### Per-kind fields

```typescript
interface ParticipantMessageEntry extends ChatEntryBase {
  kind: 'participant-message'
  authorId: string              // participantId of the sender
  content: string               // supports markdown, mentions; multimodal in future
  target: MessageTarget         // 'public' | 'private'
  recipientId?: string
  createdInSweep?: number
}

// System events — no authorId, always public, included in agent context.
interface ParticipantJoinedEntry extends ChatEntryBase {
  kind: 'participant-joined'
  participantId: string
  participantName: string
}

interface ParticipantLeftEntry extends ChatEntryBase {
  kind: 'participant-left'
  participantId: string
  participantName: string
}

interface TopicChangedEntry extends ChatEntryBase {
  kind: 'topic-changed'
  topicTitle: string
}

interface SilentDecisionEntry extends ChatEntryBase {
  kind: 'silent-decision'
  agentId: string
  reason: string
}

interface RuntimeErrorEntry extends ChatEntryBase {
  kind: 'runtime-error'
  agentId: string
  details: string
}

// Sweep events are session-level, not per-agent.
// agentId is absent for sweep-started/finished; present for sweep-stopped
// (which records which agent or user triggered the stop).
interface SweepStartedEntry extends ChatEntryBase {
  kind: 'sweep-started'
  agentId?: string
}

interface SweepFinishedEntry extends ChatEntryBase {
  kind: 'sweep-finished'
  agentId?: string
}

interface SweepStoppedEntry extends ChatEntryBase {
  kind: 'sweep-stopped'
  agentId?: string
}
```

### `EntryInspectionIndex`

Renamed from `MessageInspectionIndex`. Structure is identical; only the name changes.
Keys in `entryInspectionIndex` are entry `id` values. These are compatible with old message ids
because `TimelineMessageEntry.id` was always set to `ChatMessage.id` (same value).

```typescript
// Previously: MessageInspectionIndex
interface EntryInspectionIndex {
  sourceTraceId?: string
  downstreamTraceIds: string[]
  triggeringTraceIds: string[]
  visibleTraceIds: string[]
}
```

### `ChatTabState` changes

- `messageInspectionIndex: Record<string, MessageInspectionIndex>` → `entryInspectionIndex: Record<string, EntryInspectionIndex>`
- `DiagnosticsState.messageInspectionIndex` → `DiagnosticsState.entryInspectionIndex`
- `timeline: TimelineEntry[]` — field name unchanged, type updated

### `VisibleTimelineEntry` removed

The current `VisibleTimelineEntry` augmentation (adds `sortAt`, `isMuted` to each entry) is removed.
- `sortAt` — computed inside `buildVisibleTimelineEntries`, not stored on entries
- `isMuted` — provided by `useEntryMuted(entry)` composable inside each entry component

### Visibility filtering

`buildVisibleTimelineEntries` retains per-kind filtering. Sweep events
(`sweep-started`, `sweep-finished`, `sweep-stopped`) and silent decisions are only included
when the `showSilentDecisions` preference is enabled. This logic stays in the store, not in components.

### Removed types

- `TimelineMessageEntry` — removed
- `TimelineTechnicalEventEntry` — removed
- `ChatMessage` — removed from timeline; still used internally when building `AgentContextMessage`
- `RuntimeEvent` — removed from timeline; internal diagnostic code unchanged

## Rendering

### Registry

`HistoryCutoffEntry` is intentionally excluded — it is a UI divider, not a chat entry,
and is rendered separately in `ChatTimeline.vue`.

```typescript
// src/vue/components/timeline/entryRegistry.ts
const registry: Record<ChatEntry['kind'], Component> = {
  'participant-message': ParticipantMessageEntry,
  'participant-joined':  ParticipantJoinedEntry,
  'participant-left':    ParticipantLeftEntry,
  'topic-changed':       TopicChangedEntry,
  'silent-decision':     SilentDecisionEntry,
  'runtime-error':       RuntimeErrorEntry,
  'sweep-started':       SweepStartedEntry,
  'sweep-finished':      SweepFinishedEntry,
  'sweep-stopped':       SweepStoppedEntry,
}
```

### `ChatTimeline.vue`

Props that were per-entry (`costDisplayMode`, drag preview target) are consumed via composables
inside each entry component, not forwarded as props from `ChatTimeline.vue`.

```vue
<template v-for="entry in entries" :key="entry.id">
  <HistoryCutoffBanner v-if="entry.kind === 'history-cutoff'" :entry="entry" />
  <component v-else :is="registry[entry.kind]" :entry="entry" />
</template>
```

No knowledge of concrete entry types in `ChatTimeline.vue`.

### Entry components

Each component is fully free in layout. Shared behavior via composables:

- `useEntryInspection(entry)` — inspect-click on timestamp; works for any `ChatEntry` with a trace link
- `useEntryCost(entry)` — cost badge data
- `useEntryMuted(entry)` — muted state relative to history cutoff
- `useEntryDrag(entry)` — drag/reorder state (replaces the `sortAt`-based drag preview)

### Inspection store migration

`inspection.ts` currently works against `ChatMessage` as the inspectable object. After the rewrite:
- `currentInspectedEntry: computed<ParticipantMessageEntry | null>` replaces `currentInspectedMessage`
- `findEntryById` traverses entries where `kind === 'participant-message'`. Only participant messages are inspectable: system events do not carry `sourceTraceId` in practice (they are triggered by user actions, not agent sweeps), so there is nothing to inspect. The existing test that asserts system message timestamps are inspectable should be updated to reflect this.
- `contextMessagesForCurrentTrace` returns `ParticipantMessageEntry[]`
- `usedInMessagesForCurrentMessage` → `usedInEntriesForCurrentEntry` returns `ParticipantMessageEntry[]`

### Extensibility

Adding a new entry type (e.g. `PollEntry`):
1. Add `PollEntry` to the `ChatEntry` union in `types.ts`
2. Create `PollEntry.vue`
3. Register in `entryRegistry.ts`

`ChatTimeline.vue` is never touched.

## Migration

No gradual migration. Storage is reset. All existing code is updated in one pass guided by TypeScript errors after the type changes.

### Order of changes

1. **Types** — rewrite `types.ts`: new `ChatEntry` union, `EntryInspectionIndex`, remove wrapper types, update `ChatTabState` and `DiagnosticsState`
2. **Core** — update entry creation in `messaging.ts`, `diagnostics.ts`, `context-routing.ts`; update store logic in `timeline.ts`, `runtime.ts`
3. **Inspection store** — migrate `inspection.ts` from `ChatMessage` to `ParticipantMessageEntry`; update `entryInspectionIndex` references
4. **Rendering** — create entry components and composables, `entryRegistry.ts`; update `ChatTimeline.vue`; delete `MessageEntry.vue`, `TechnicalEventEntry.vue`, `ChatMessageLine.vue`
5. **Cleanup** — remove `VisibleTimelineEntry`, unused types, remaining references

## What stays unchanged

- `HistoryCutoffEntry` — unchanged
- `RequestTrace` — structure unchanged; field names (`triggeringMessageIds`, `visibleMessageIds`, `producedMessageId`) stay as-is since they refer specifically to `ParticipantMessageEntry` ids and the semantics are unchanged
- `AgentContextMessage` — type definition unchanged
- `RuntimeError` in diagnostics — unchanged, separate from timeline
- `DebugLogEntry` — unchanged

## `context-routing.ts` migration

`getVisibleContextMessages` currently filters `timeline` for `kind === 'message'` entries and returns `.message`. After the rewrite it must filter for `kind === 'participant-message'` and `kind === 'system-event'` directly.

`SystemEventEntry` has no `content` field. `getVisibleMessagesForAgent` must synthesize `AgentContextMessage.content` from the structured fields:

```typescript
function systemEventContent(entry: ParticipantJoinedEntry | ParticipantLeftEntry | TopicChangedEntry): string {
  switch (entry.kind) {
    case 'participant-joined': return `${entry.participantName} joined the chat`
    case 'participant-left':   return `${entry.participantName} left the chat`
    case 'topic-changed':      return `Topic changed to: ${entry.topicTitle}`
  }
}
```

System event entries have no `target` — they map to `'public'` unconditionally.

## `diagnostics.ts` and `traces.ts` migration

The internal helper `getMessageInspectionIndexEntry` in `diagnostics.ts` accesses `tab.messageInspectionIndex`. It must be updated to `tab.entryInspectionIndex`. All direct accesses to `tab.messageInspectionIndex` in `traces.ts` must also be updated. These are Step 2 (Core) changes.
