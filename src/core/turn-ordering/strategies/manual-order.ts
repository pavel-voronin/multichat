import type { AgentConfig } from '../../types';

export function applyManualOrder(
  agents: AgentConfig[],
  order: string[],
): AgentConfig[] {
  const byId = new Map(
    order.map((agentId, index) => [agentId, index] as const),
  );

  return agents
    .map((agent, index) => ({
      agent,
      index,
      orderIndex: byId.get(agent.id) ?? Number.POSITIVE_INFINITY,
    }))
    .sort(
      (left, right) =>
        left.orderIndex - right.orderIndex || left.index - right.index,
    )
    .map(({ agent }) => agent);
}
