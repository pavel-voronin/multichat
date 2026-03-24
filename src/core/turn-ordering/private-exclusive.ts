import type { AgentConfig, ParticipantMessageEntry } from '../types';

export function applyPrivateExclusive(
  agents: AgentConfig[],
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] | null {
  if (
    !triggeringMessage ||
    triggeringMessage.target !== 'private' ||
    !triggeringMessage.recipientId
  ) {
    return null;
  }

  const recipient = agents.find(
    (agent) => agent.id === triggeringMessage.recipientId,
  );
  return recipient ? [recipient] : [];
}
