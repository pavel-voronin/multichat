import type { AgentConfig } from '../../types';

function getAgentPrice(agent: AgentConfig): number {
  const promptPrice = parseFloat(agent.pricing?.prompt ?? '0');
  const completionPrice = parseFloat(agent.pricing?.completion ?? '0');
  return (
    (Number.isFinite(promptPrice) ? promptPrice : 0) +
    (Number.isFinite(completionPrice) ? completionPrice : 0)
  );
}

export function applyCheapFirst(agents: AgentConfig[]): AgentConfig[] {
  return agents
    .map((agent, index) => ({ agent, index, price: getAgentPrice(agent) }))
    .sort((left, right) => left.price - right.price || left.index - right.index)
    .map(({ agent }) => agent);
}
