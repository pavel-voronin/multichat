import type { AgentConfig } from '../../types';

export function applySlidingCycle(
  agents: AgentConfig[],
  offset: number,
): AgentConfig[] {
  if (!agents.length) {
    return [];
  }

  const normalizedOffset =
    ((offset % agents.length) + agents.length) % agents.length;
  return [
    ...agents.slice(normalizedOffset),
    ...agents.slice(0, normalizedOffset),
  ];
}
