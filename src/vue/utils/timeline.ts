import type { MultiChatRuntime, RuntimeState, TimelineEntry } from '../../core';
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
      entry.kind === 'sweep-stopped' ||
      entry.kind === 'agent-memory-changed'
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

function getActiveManualCutoffIndex(timeline: TimelineEntry[]): number | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual') {
      return index;
    }
  }

  return null;
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
    'agent-memory-changed': 2,
  };

  return priority[left.kind] - priority[right.kind];
}
