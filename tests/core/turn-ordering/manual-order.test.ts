import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core';
import { applyManualOrder } from '../../../src/core/turn-ordering/strategies/manual-order';

function makeAgent(id: string, name = id): AgentConfig {
  return {
    id,
    name,
    modelId: 'model',
    systemPrompt: '',
    isEnabled: true,
    isHidden: false,
  };
}

describe('manual_order strategy', () => {
  it('orders listed agents first and appends unlisted agents by chat order', () => {
    const alpha = makeAgent('alpha', 'Alpha');
    const beta = makeAgent('beta', 'Beta');
    const gamma = makeAgent('gamma', 'Gamma');

    expect(
      applyManualOrder([alpha, beta, gamma], ['gamma', 'alpha']).map((agent) =>
        agent.name,
      ),
    ).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('uses agent ids so duplicate names can be ordered independently', () => {
    expect(
      applyManualOrder(
        [makeAgent('alpha', 'Same'), makeAgent('beta', 'Same')],
        ['beta', 'alpha'],
      ).map((agent) => agent.name),
    ).toEqual(['Same', 'Same']);
    expect(
      applyManualOrder(
        [makeAgent('alpha', 'Same'), makeAgent('beta', 'Same')],
        ['beta', 'alpha'],
      ).map((agent) => agent.id),
    ).toEqual(['beta', 'alpha']);
  });
});
