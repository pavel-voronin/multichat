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

  it('publishes system messages when an agent joins and leaves', () => {
    const runtime = createRuntime();
    const agent = runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
    });

    expect(runtime.getTimelineEntries().at(-1)).toMatchObject({
      kind: 'participant-joined',
      participantId: agent.id,
      participantName: 'Alpha',
    });

    runtime.removeAgent(agent.id);

    expect(runtime.getTimelineEntries().at(-1)).toMatchObject({
      kind: 'participant-left',
      participantId: agent.id,
      participantName: 'Alpha',
    });
  });

  it('passes only active chat participants into the agent prompt context', async () => {
    let seenParticipantIds: string[] = [];
    const runtime = createRuntime({
      transport: {
        async listModels() {
          return [];
        },
        async runAgentTurn(input) {
          seenParticipantIds = input.context.participants.map(
            (participant) => participant.id,
          );
          return {
            mode: 'tools',
            actions: [],
          };
        },
      },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const alpha = runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
    });
    const beta = runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
    });

    runtime.removeAgent(beta.id);

    await runtime.sendMessage({
      senderId: 'human',
      content: 'Need a reply',
      target: 'public',
    });

    expect(seenParticipantIds).toEqual(['human', alpha.id]);
  });

  it('publishes a system message when the tab title changes', () => {
    const runtime = createRuntime();

    runtime.renameTab(runtime.getState().activeTabId, 'New topic');

    expect(runtime.getTimelineEntries().at(-1)).toMatchObject({
      kind: 'topic-changed',
      topicTitle: 'New topic',
    });
  });

  it('does not publish a system message for a no-op tab rename', () => {
    const runtime = createRuntime();
    const tab = runtime.getWorkspaceState().tabs[0]!;
    const beforeCount = runtime.getTimelineEntries().length;

    runtime.renameTab(tab.id, tab.title);

    const afterCount = runtime.getTimelineEntries().length;

    expect(afterCount).toBe(beforeCount);
  });
});
