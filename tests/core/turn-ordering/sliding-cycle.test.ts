import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core';
import { applySlidingCycle } from '../../../src/core/turn-ordering/strategies/sliding-cycle';

function makeAgent(id: string): AgentConfig {
  return {
    id,
    name: id,
    modelId: 'model',
    systemPrompt: '',
    isEnabled: true,
    isHidden: false,
  };
}

describe('sliding_cycle strategy', () => {
  it('rotates the ring by offset', () => {
    const agents = [makeAgent('a'), makeAgent('b'), makeAgent('c')];
    expect(applySlidingCycle(agents, 1).map((agent) => agent.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('wraps large offsets modulo active agents', () => {
    const agents = [makeAgent('a'), makeAgent('b'), makeAgent('c')];
    expect(applySlidingCycle(agents, 4).map((agent) => agent.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
});
