import { type DebugLogEntry } from '../../core';

export interface ParticipantNameLookup {
  byId: (participantId: string) => string | null;
}

export function formatMessageTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatParticipantName(
  authorId: string,
  target: 'public' | 'private',
  recipientId: string | undefined,
  lookup: ParticipantNameLookup,
): string {
  const sender = lookup.byId(authorId) ?? authorId;
  if (target === 'private') {
    const recipient = recipientId
      ? (lookup.byId(recipientId) ?? recipientId)
      : 'all';
    return `<${sender} -> ${recipient}>`;
  }
  return `<${sender}>`;
}

export function formatDebugLogLine(entry: DebugLogEntry): string {
  const segments = [`[${formatMessageTime(entry.createdAt)}]`, entry.kind];

  if (typeof entry.sweep === 'number' && entry.sweep > 0) {
    segments.push(`sweep=${entry.sweep}`);
  }

  if (entry.agentName || entry.agentId) {
    segments.push(`agent=${entry.agentName ?? entry.agentId}`);
  }

  if (entry.agentId) {
    segments.push(`agentId=${entry.agentId}`);
  }

  if (entry.mode) {
    segments.push(`mode=${entry.mode}`);
  }

  if (typeof entry.fallback === 'boolean') {
    segments.push(`fallback=${entry.fallback ? 'yes' : 'no'}`);
  }

  if (entry.trigger) {
    segments.push(`trigger=${entry.trigger}`);
  }

  if (entry.skipReason) {
    segments.push(`skip=${entry.skipReason}`);
  }

  if (entry.actionTypes?.length) {
    segments.push(`actions=[${entry.actionTypes.join(', ')}]`);
  }

  if (entry.messageIds?.length) {
    segments.push(`messageIds=[${entry.messageIds.join(', ')}]`);
  }

  if (entry.recipientIds?.length) {
    segments.push(`recipientIds=[${entry.recipientIds.join(', ')}]`);
  }

  if (entry.triggeringMessageIds?.length) {
    segments.push(`triggering=[${entry.triggeringMessageIds.join(', ')}]`);
  }

  if (entry.visibleMessageIds?.length) {
    segments.push(`visible=[${entry.visibleMessageIds.join(', ')}]`);
  }

  if (entry.nonSelfVisibleMessageIds?.length) {
    segments.push(`nonSelf=[${entry.nonSelfVisibleMessageIds.join(', ')}]`);
  }

  if (entry.contextKeyPrev !== undefined) {
    segments.push(`ctxPrev=${entry.contextKeyPrev || '∅'}`);
  }

  if (entry.contextKeyNext !== undefined) {
    segments.push(`ctxNext=${entry.contextKeyNext || '∅'}`);
  }

  if (entry.details) {
    segments.push(`details=${JSON.stringify(entry.details)}`);
  }

  return segments.join(' ');
}
