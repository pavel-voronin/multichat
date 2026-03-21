import type {
  AgentContextCutoff,
  ChatMessage,
  ContextCutoffAnchor,
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
  preferences: Pick<
    ChatViewPreferences,
    'showContextCutoffs' | 'showSilentDecisions'
  >;
}): VisibleTimelineEntry[] {
  const activeManualCutoffIndex = getActiveManualCutoffIndex(
    input.state.timeline,
  );
  const visibleEntries: VisibleTimelineEntry[] = [];
  const visibleMessages: Array<{ message: ChatMessage; sortAt: number }> = [];

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

      visibleMessages.push({ message: entry.message, sortAt });
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

  if (input.preferences.showContextCutoffs) {
    for (const cutoff of input.runtime.getAgentContextCutoffs()) {
      const sortAt = resolveCutoffSortTime(cutoff.anchor, visibleMessages);
      visibleEntries.push({
        id: `preview-cutoff-${input.state.activeTabId}-${cutoff.anchor.kind}-${cutoff.anchor.messageId ?? 'none'}-${cutoff.agentIds.join(',')}`,
        createdAt: new Date(sortAt).toISOString(),
        kind: 'history-cutoff',
        cutoff: {
          source: 'preview',
          label: formatPreviewCutoffLabel(cutoff, input.state),
          anchor: cutoff.anchor,
          agentIds: cutoff.agentIds,
          agentNames: cutoff.agentNames,
        },
        sortAt,
      });
    }
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

function formatPreviewCutoffLabel(
  cutoff: AgentContextCutoff,
  state: RuntimeState,
): string {
  const activeAgentCount = state.agents.filter(
    (agent) => agent.isEnabled !== false && agent.isHidden !== true,
  ).length;
  if (activeAgentCount > 0 && cutoff.agentIds.length === activeAgentCount) {
    return 'context for: all agents';
  }

  return `context for: ${cutoff.agentNames.join(', ')}`;
}

function resolveCutoffSortTime(
  anchor: ContextCutoffAnchor,
  messages: Array<{ message: ChatMessage; sortAt: number }>,
): number {
  if (!messages.length) {
    return 0;
  }

  if (anchor.kind === 'start') {
    return messages[0]!.sortAt - 1;
  }

  if (anchor.kind === 'end') {
    return messages.at(-1)!.sortAt + 1;
  }

  const messageIndex = messages.findIndex(
    (entry) => entry.message.id === anchor.messageId,
  );
  if (messageIndex === -1) {
    return anchor.kind === 'after-message'
      ? messages.at(-1)!.sortAt + 1
      : messages[0]!.sortAt - 1;
  }

  const previousMessage =
    anchor.kind === 'after-message'
      ? messages[messageIndex]
      : messages[messageIndex - 1];
  const nextMessage =
    anchor.kind === 'after-message'
      ? messages[messageIndex + 1]
      : messages[messageIndex];
  const previousTime = previousMessage?.sortAt ?? null;
  const nextTime = nextMessage?.sortAt ?? null;

  if (previousTime !== null && nextTime !== null) {
    return previousTime === nextTime
      ? previousTime + 0.5
      : previousTime + (nextTime - previousTime) / 2;
  }

  if (previousTime !== null) {
    return previousTime + 0.5;
  }

  return (nextTime ?? 0) - 0.5;
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
