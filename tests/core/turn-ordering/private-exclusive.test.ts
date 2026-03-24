import { describe, expect, it } from 'vitest';
import type { AgentConfig, ParticipantMessageEntry } from '../../../src/core';
import { applyPrivateExclusive } from '../../../src/core/turn-ordering/private-exclusive';

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

function makeMessage(
  target: 'public' | 'private',
  recipientId?: string,
): ParticipantMessageEntry {
  return {
    id: 'message-1',
    kind: 'participant-message',
    authorId: 'human',
    content: 'hello',
    target,
    recipientId,
    createdAt: '2026-03-24T00:00:00.000Z',
  };
}

describe('private exclusive delivery', () => {
  it('returns only the named recipient for private messages', () => {
    const alpha = makeAgent('alpha');
    const beta = makeAgent('beta');

    expect(
      applyPrivateExclusive([alpha, beta], makeMessage('private', 'beta')),
    ).toEqual([beta]);
  });

  it('returns null for public messages', () => {
    expect(
      applyPrivateExclusive([makeAgent('alpha')], makeMessage('public')),
    ).toBeNull();
  });
});
