import type { AgentConfig, ParticipantMessageEntry } from '../../types';

export function applyKeywords(
  agents: AgentConfig[],
  keywords: Record<string, string[]>,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  if (!triggeringMessage) {
    return [...agents];
  }

  const normalizedContent = triggeringMessage.content.toLocaleLowerCase();
  const matched = new Set<string>();
  const unmatched: AgentConfig[] = [];

  for (const agent of agents) {
    const configuredKeywords = keywords[agent.id] ?? [];
    const hasMatch = configuredKeywords.some((keyword) => {
      const normalizedKeyword = keyword.trim().toLocaleLowerCase();
      return (
        normalizedKeyword.length > 0 &&
        normalizedContent.includes(normalizedKeyword)
      );
    });

    if (hasMatch) {
      matched.add(agent.id);
    } else {
      unmatched.push(agent);
    }
  }

  if (!matched.size) {
    return [...agents];
  }

  return [...agents.filter((agent) => matched.has(agent.id)), ...unmatched];
}
