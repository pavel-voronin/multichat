import type { ChatMessage } from './types';

export const SYSTEM_AUTHOR_NAME = 'System';

export function isSystemMessage(message: ChatMessage): boolean {
  return message.author.type === 'system';
}

export function getMessageSenderId(message: ChatMessage): string | null {
  return message.author.type === 'participant'
    ? message.author.participantId
    : null;
}

export function getMessageSenderIdOrThrow(message: ChatMessage): string {
  const senderId = getMessageSenderId(message);
  if (!senderId) {
    throw new Error('System messages do not have a participant sender');
  }
  return senderId;
}
