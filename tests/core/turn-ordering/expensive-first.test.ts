import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core';
import { applyExpensiveFirst } from '../../../src/core/turn-ordering/strategies/expensive-first';

function makeAgent(
  id: string,
  prompt?: string,
  completion?: string,
): AgentConfig {
  return {
    id,
    name: id,
    modelId: 'model',
    systemPrompt: '',
    isEnabled: true,
    isHidden: false,
    pricing:
      prompt || completion
        ? {
            prompt,
            completion,
          }
        : undefined,
  };
}

describe('expensive_first strategy', () => {
  it('sorts agents descending by price', () => {
    const cheap = makeAgent('cheap', '0.0000001', '0.0000001');
    const mid = makeAgent('mid', '0.000001', '0.000001');
    const expensive = makeAgent('expensive', '0.00001', '0.00001');

    expect(
      applyExpensiveFirst([cheap, mid, expensive]).map((agent) => agent.id),
    ).toEqual(['expensive', 'mid', 'cheap']);
  });

  it('treats missing pricing as zero and sorts it last', () => {
    expect(
      applyExpensiveFirst([
        makeAgent('free'),
        makeAgent('priced', '0.000001', '0.000001'),
      ]).map((agent) => agent.id),
    ).toEqual(['priced', 'free']);
  });

  it('preserves input order on price ties', () => {
    expect(
      applyExpensiveFirst([
        makeAgent('a', '0.000001', '0.000001'),
        makeAgent('b', '0.000001', '0.000001'),
      ]).map((agent) => agent.id),
    ).toEqual(['a', 'b']);
  });
});
