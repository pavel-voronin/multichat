import { describe, expect, it } from 'vitest';
import type { AgentConfig, ParticipantMessageEntry } from '../../../src/core';
import { applyKeywords } from '../../../src/core/turn-ordering/strategies/keywords';

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

describe('keywords strategy', () => {
  it('moves matching agents first while preserving chat-order ties', () => {
    const alpha = makeAgent('alpha', 'Alpha');
    const beta = makeAgent('beta', 'Beta');
    const gamma = makeAgent('gamma', 'Gamma');

    expect(
      applyKeywords(
        [alpha, beta, gamma],
        {
          alpha: ['frontend'],
          gamma: ['ui'],
        },
        makeMessage('Need frontend and ui help'),
      ).map((agent) => agent.name),
    ).toEqual(['Alpha', 'Gamma', 'Beta']);
  });

  it('falls back to chat order when there is no triggering message', () => {
    const agents = [makeAgent('alpha'), makeAgent('beta')];
    expect(applyKeywords(agents, { alpha: ['x'] }, null)).toEqual(agents);
  });

  it('uses agent ids so renamed or duplicate-name agents still match', () => {
    const alpha = makeAgent('alpha', 'Same');
    const beta = makeAgent('beta', 'Same');

    expect(
      applyKeywords(
        [beta, alpha],
        { alpha: ['infra'] },
        makeMessage('Please check INFRA work'),
      ).map((agent) => agent.id),
    ).toEqual(['alpha', 'beta']);
  });
});
