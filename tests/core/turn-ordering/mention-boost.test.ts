import { describe, expect, it } from 'vitest';
import type { AgentConfig, ParticipantMessageEntry } from '../../../src/core';
import { applyMentionBoost } from '../../../src/core/turn-ordering/mention-boost';

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

function makeMessage(content: string): ParticipantMessageEntry {
  return {
    id: 'message-1',
    kind: 'participant-message',
    authorId: 'human',
    content,
    target: 'public',
    createdAt: '2026-03-24T00:00:00.000Z',
  };
}

describe('mention boost', () => {
  it('moves mentioned agents to the front in mention order', () => {
    const alpha = makeAgent('alpha', 'Alpha');
    const beta = makeAgent('beta', 'Beta');
    const gamma = makeAgent('gamma', 'Gamma');

    expect(
      applyMentionBoost(
        [alpha, beta, gamma],
        makeMessage('Gamma, Alpha: check this'),
      ).map((agent) => agent.name),
    ).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('ignores prefixes when first colon is after a newline', () => {
    const agents = [makeAgent('alpha', 'Alpha'), makeAgent('beta', 'Beta')];
    expect(
      applyMentionBoost(agents, makeMessage('Alpha\nBeta: not a prefix')),
    ).toEqual(agents);
  });

  it('ignores unknown names', () => {
    const agents = [makeAgent('alpha', 'Alpha'), makeAgent('beta', 'Beta')];
    expect(
      applyMentionBoost(agents, makeMessage('Unknown, Beta: check this')).map(
        (agent) => agent.name,
      ),
    ).toEqual(['Beta', 'Alpha']);
  });
});
