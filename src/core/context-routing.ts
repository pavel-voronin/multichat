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
