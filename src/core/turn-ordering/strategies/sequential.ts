import type { AgentConfig } from '../../types';

export function applySequential(agents: AgentConfig[]): AgentConfig[] {
  return [...agents];
}
