import { describe, expect, it } from 'vitest';
import { createRuntime } from './helpers';

describe('MultiChatRuntime participant lifecycle', () => {
  it('updates human participant name', () => {
    const runtime = createRuntime();

    runtime.updateHumanParticipant({ name: 'Pavel' });

    expect(runtime.getState().participants[0]).toMatchObject({
      id: 'human',
      name: 'Pavel',
      role: 'human',
    });
  });

  it('soft deletes agents so their names remain available in chat history', async () => {
    const runtime = createRuntime();
    const agent = runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });

    await runtime.sendMessage({
      senderId: agent.id,
      content: 'archived reply',
      target: 'public',
      triggerSweep: false,
    });

    runtime.removeAgent(agent.id);

    const state = runtime.getState();
    expect(state.agents).toEqual([
      expect.objectContaining({
        id: agent.id,
        name: 'Alpha',
        isEnabled: false,
        isHidden: true,
      }),
    ]);
    expect(
      state.participants.find((participant) => participant.id === agent.id),
    ).toEqual(
      expect.objectContaining({
        id: agent.id,
        name: 'Alpha',
        role: 'agent',
      }),
    );
    expect(state.metrics[agent.id]).toEqual(
      expect.objectContaining({
        requestCount: 0,
      }),
    );
  });
});
