import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core';
import { applyCheapFirst } from '../../../src/core/turn-ordering/strategies/cheap-first';

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

describe('cheap_first strategy', () => {
  it('sorts agents ascending by price', () => {
    const cheap = makeAgent('cheap', '0.0000001', '0.0000001');
    const mid = makeAgent('mid', '0.000001', '0.000001');
    const expensive = makeAgent('expensive', '0.00001', '0.00001');

    expect(
      applyCheapFirst([expensive, mid, cheap]).map((agent) => agent.id),
    ).toEqual(['cheap', 'mid', 'expensive']);
  });

  it('treats missing pricing as zero and sorts it first', () => {
    expect(
      applyCheapFirst([
        makeAgent('priced', '0.000001', '0.000001'),
        makeAgent('free'),
      ]).map((agent) => agent.id),
    ).toEqual(['free', 'priced']);
  });

  it('preserves input order on price ties', () => {
    expect(
      applyCheapFirst([
        makeAgent('a', '0.000001', '0.000001'),
        makeAgent('b', '0.000001', '0.000001'),
      ]).map((agent) => agent.id),
    ).toEqual(['a', 'b']);
  });
});
