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
  | SystemEventEntry          // kind: 'system-event'
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
  authorId: string
  content: string               // supports markdown, mentions; multimodal in future
  target: MessageTarget
  recipientId?: string
  createdInSweep?: number
}

interface SystemEventEntry extends ChatEntryBase {
  kind: 'system-event'
  type: SystemMessageType       // 'participant_joined' | 'participant_left' | 'topic_changed'
  participantId?: string
  participantName?: string
  topicTitle?: string
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

interface SweepStartedEntry extends ChatEntryBase {
  kind: 'sweep-started'
  agentId: string
}

interface SweepFinishedEntry extends ChatEntryBase {
  kind: 'sweep-finished'
  agentId: string
}

interface SweepStoppedEntry extends ChatEntryBase {
  kind: 'sweep-stopped'
  agentId: string
}
```

### `ChatTabState` changes

- `messageInspectionIndex` → `entryInspectionIndex: Record<string, EntryInspectionIndex>`
- `timeline: TimelineEntry[]` — field name unchanged, type updated

### Removed types

- `TimelineMessageEntry` — removed
- `TimelineTechnicalEventEntry` — removed
- `ChatMessage` — removed from timeline; kept only for `AgentContextMessage` construction
- `RuntimeEvent` — removed from timeline; internal diagnostic types unchanged

## Rendering

### Registry

```typescript
// src/vue/components/timeline/entryRegistry.ts
const registry: Record<ChatEntry['kind'], Component> = {
  'participant-message': ParticipantMessageEntry,
  'system-event':        SystemEventEntry,
  'silent-decision':     SilentDecisionEntry,
  'runtime-error':       RuntimeErrorEntry,
  'sweep-started':       SweepStartedEntry,
  'sweep-finished':      SweepFinishedEntry,
  'sweep-stopped':       SweepStoppedEntry,
}
```

### `ChatTimeline.vue`

```vue
<template v-for="entry in entries" :key="entry.id">
  <HistoryCutoffBanner v-if="entry.kind === 'history-cutoff'" :entry="entry" />
  <component v-else :is="registry[entry.kind]" :entry="entry" />
</template>
```

No knowledge of concrete entry types. `HistoryCutoffBanner` is a UI divider, not a chat entry.

### Entry components

Each component is fully free in layout. Shared behavior via composables:

- `useEntryInspection(entry)` — inspect-click on timestamp
- `useEntryCost(entry)` — cost badge data
- `useEntryMuted(entry)` — muted state relative to history cutoff

### Extensibility

Adding a new entry type (e.g. `PollEntry`):
1. Add `PollEntry` to the `ChatEntry` union in `types.ts`
2. Create `PollEntry.vue`
3. Register in `entryRegistry.ts`

`ChatTimeline.vue` is never touched.

## Migration

No gradual migration. Storage is reset. All existing code is updated in one pass guided by TypeScript errors after the type changes.

### Order of changes

1. **Types** — rewrite `types.ts`: new `ChatEntry` union, remove wrapper types, rename `messageInspectionIndex`
2. **Core** — update entry creation in `messaging.ts`, `diagnostics.ts`; update store logic in `timeline.ts`, `inspection.ts`, `runtime.ts`
3. **Rendering** — create entry components, `entryRegistry.ts`; update `ChatTimeline.vue`; delete `MessageEntry.vue`, `TechnicalEventEntry.vue`, `ChatMessageLine.vue`
4. **Cleanup** — remove unused types, update remaining references

## What stays unchanged

- `HistoryCutoffEntry` — unchanged
- `RequestTrace` and `EntryInspectionIndex` — field names updated but structure unchanged
- `AgentContextMessage` — unchanged; built from `ParticipantMessageEntry` at runtime
- `RuntimeError` in diagnostics — unchanged, separate from timeline
- `DebugLogEntry` — unchanged
