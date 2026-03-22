import type {
  ChatMessage,
  MultiChatRuntime,
  RuntimeEvent,
  RuntimeState,
  TimelineEntry,
} from '../../core';
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

    if (entry.kind === 'message') {
      if (
        !input.runtime.isMessageVisibleToParticipant(
          entry.message,
          input.participantId,
        )
      ) {
        continue;
      }

      visibleEntries.push({
        ...entry,
        sortAt,
        isMuted:
          activeManualCutoffIndex !== null && index < activeManualCutoffIndex,
      });
      continue;
    }

    if (entry.kind === 'technical-event') {
      if (
        !input.preferences.showSilentDecisions ||
        !shouldShowTechnicalEvent(entry.event)
      ) {
        continue;
      }

      visibleEntries.push({
        ...entry,
        sortAt,
      });
      continue;
    }

    visibleEntries.push({
      ...entry,
      sortAt,
    });
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

function shouldShowTechnicalEvent(event: RuntimeEvent): boolean {
  return event.type === 'silent-decision' || event.type === 'runtime-error';
}

function compareVisibleTimelineEntries(
  left: VisibleTimelineEntry,
  right: VisibleTimelineEntry,
): number {
  if (left.sortAt !== right.sortAt) {
    return left.sortAt - right.sortAt;
  }

  const priority = {
    'history-cutoff': 0,
    message: 1,
    'technical-event': 2,
  } as const;

  return priority[left.kind] - priority[right.kind];
}
