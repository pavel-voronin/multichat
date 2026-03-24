import type {
  AgentConfig,
  AgentContextMessage,
  ChatTabState,
  ParticipantJoinedEntry,
  ParticipantLeftEntry,
  ParticipantMessageEntry,
  TopicChangedEntry,
} from './types';
import { getActiveManualCutoffIndex } from './diagnostics';
import { DEFAULT_HUMAN } from './workspace';

export type ContextEntry =
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

export function isEntryVisibleToAgent(
  entry: ContextEntry,
  agentId: string,
): boolean {
  if (entry.kind !== 'participant-message') return true;
  if (entry.target === 'public') return true;
  return entry.authorId === agentId || entry.recipientId === agentId;
}

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

// Keep old function name as alias for backward compat during migration
export const isMessageVisibleToAgent = isEntryVisibleToAgent;
export const isMessageVisibleToParticipant = isEntryVisibleToParticipant;

export function getNonSelfVisibleMessageIds(
  agentId: string,
  tab: ChatTabState,
): string[] {
  return getVisibleMessagesForAgent(agentId, tab)
    .filter((message) => message.senderId !== agentId)
    .map((message) => message.id);
}

export function getVisibleContextKey(
  agentId: string,
  tab: ChatTabState,
): string {
  return getNonSelfVisibleMessageIds(agentId, tab).join('|');
}

export function hasNewVisibleInputForAgent(
  agentId: string,
  tab: ChatTabState,
  processedKeys: Map<string, string>,
): boolean {
  if (!processedKeys.has(agentId)) {
    return true;
  }

  const previousIds = new Set(
    (processedKeys.get(agentId) ?? '').split('|').filter(Boolean),
  );
  const nextIds = getNonSelfVisibleMessageIds(agentId, tab);
  return nextIds.some((messageId) => !previousIds.has(messageId));
}

export function markVisibleContextProcessed(
  agentId: string,
  tab: ChatTabState,
  processedKeys: Map<string, string>,
): void {
  processedKeys.set(agentId, getVisibleContextKey(agentId, tab));
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
