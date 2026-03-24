import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core';
import { applyRandom } from '../../../src/core/turn-ordering/strategies/random';

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

describe('random strategy', () => {
  it('uses sweepCount as deterministic seed', () => {
    const agents = [
      makeAgent('a'),
      makeAgent('b'),
      makeAgent('c'),
      makeAgent('d'),
    ];

    expect(applyRandom(agents, 7).map((agent) => agent.id)).toEqual(
      applyRandom(agents, 7).map((agent) => agent.id),
    );
  });

  it('changes order when seed changes', () => {
    const agents = [
      makeAgent('a'),
      makeAgent('b'),
      makeAgent('c'),
      makeAgent('d'),
    ];

    expect(applyRandom(agents, 1).map((agent) => agent.id)).not.toEqual(
      applyRandom(agents, 2).map((agent) => agent.id),
    );
  });
});
