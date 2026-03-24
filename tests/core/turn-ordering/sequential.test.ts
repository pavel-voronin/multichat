import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core';
import { applySequential } from '../../../src/core/turn-ordering/strategies/sequential';

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

describe('sequential strategy', () => {
  it('returns agents in input order', () => {
    const agents = [makeAgent('a'), makeAgent('b'), makeAgent('c')];
    expect(applySequential(agents)).toEqual(agents);
  });

  it('returns empty array for no agents', () => {
    expect(applySequential([])).toEqual([]);
  });
});
