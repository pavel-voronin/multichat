import type { AgentConfig, ParticipantMessageEntry } from '../types';

export function applyMentionBoost(
  queue: AgentConfig[],
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  if (!triggeringMessage) {
    return [...queue];
  }

  const firstColonIndex = triggeringMessage.content.indexOf(':');
  if (firstColonIndex === -1) {
    return [...queue];
  }

  const firstNewLineIndex = triggeringMessage.content.indexOf('\n');
  if (firstNewLineIndex !== -1 && firstColonIndex > firstNewLineIndex) {
    return [...queue];
  }

  const candidatePrefix = triggeringMessage.content.slice(0, firstColonIndex);
  const mentionedNames = candidatePrefix
    .split(',')
    .map((token) => token.trim().toLocaleLowerCase())
    .filter(Boolean);

  const matchedIds: string[] = [];
  const matchedSet = new Set<string>();
  for (const name of mentionedNames) {
    const matchedAgent = queue.find(
      (agent) => agent.name.toLocaleLowerCase() === name,
    );
    if (matchedAgent && !matchedSet.has(matchedAgent.id)) {
      matchedIds.push(matchedAgent.id);
      matchedSet.add(matchedAgent.id);
    }
  }

  if (!matchedIds.length) {
    return [...queue];
  }

  const matchedAgents = matchedIds
    .map((id) => queue.find((agent) => agent.id === id))
    .filter((agent): agent is AgentConfig => agent !== undefined);

  return [
    ...matchedAgents,
    ...queue.filter((agent) => !matchedSet.has(agent.id)),
  ];
}
