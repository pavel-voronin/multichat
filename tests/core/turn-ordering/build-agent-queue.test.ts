import { describe, expect, it } from 'vitest';
import { buildAgentQueue } from '../../../src/core/turn-ordering';
import { createEmptyTabState } from '../../../src/core/workspace';
import type { AgentConfig, ParticipantMessageEntry } from '../../../src/core';

function makeAgent(
  id: string,
  name = id,
  pricing?: AgentConfig['pricing'],
): AgentConfig {
  return {
    id,
    name,
    modelId: 'model',
    systemPrompt: '',
    isEnabled: true,
    isHidden: false,
    pricing,
  };
}

function makeMessage(
  content: string,
  target: 'public' | 'private' = 'public',
  recipientId?: string,
): ParticipantMessageEntry {
  return {
    id: 'message-1',
    kind: 'participant-message',
    authorId: 'human',
    content,
    target,
    recipientId,
    createdAt: '2026-03-24T00:00:00.000Z',
  };
}

function makeTab(agents: AgentConfig[]) {
  const tab = createEmptyTabState({
    id: 'tab-1',
    human: {
      id: 'human',
      name: 'Human',
      role: 'human',
    },
  });
  tab.agents = agents;
  tab.participants = [
    { id: 'human', name: 'Human', role: 'human' },
    ...agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: 'agent' as const,
    })),
  ];
  return tab;
}

describe('buildAgentQueue', () => {
  it('applies strategy first and then mention boost', () => {
    const alpha = makeAgent('alpha', 'Alpha', { prompt: '1', completion: '1' });
    const beta = makeAgent('beta', 'Beta', { prompt: '2', completion: '2' });
    const gamma = makeAgent('gamma', 'Gamma', { prompt: '3', completion: '3' });
    const tab = makeTab([alpha, beta, gamma]);
    tab.turnOrdering = { strategy: 'cheap_first' };

    expect(
      buildAgentQueue(tab, makeMessage('Gamma, Beta: check this')).map(
        (agent) => agent.name,
      ),
    ).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('uses chat order fallback for keywords when there is no match', () => {
    const alpha = makeAgent('alpha', 'Alpha');
    const beta = makeAgent('beta', 'Beta');
    const tab = makeTab([alpha, beta]);
    tab.turnOrdering = {
      strategy: 'keywords',
      keywords: {
        alpha: ['infra'],
      },
    };

    expect(
      buildAgentQueue(tab, makeMessage('No signal')).map((agent) => agent.name),
    ).toEqual(['Alpha', 'Beta']);
  });
});
