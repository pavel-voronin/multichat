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

  it('publishes system messages when an agent joins and leaves', () => {
    const runtime = createRuntime();
    const agent = runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });

    let messages = runtime
      .getTimelineEntries()
      .filter((entry) => entry.kind === 'message')
      .map((entry) => entry.message);
    expect(messages.at(-1)).toMatchObject({
      author: { type: 'system' },
      kind: 'system',
      content: 'Alpha joined the chat',
      system: {
        type: 'participant_joined',
        participantId: agent.id,
        participantName: 'Alpha',
      },
    });

    runtime.removeAgent(agent.id);

    messages = runtime
      .getTimelineEntries()
      .filter((entry) => entry.kind === 'message')
      .map((entry) => entry.message);
    expect(messages.at(-1)).toMatchObject({
      author: { type: 'system' },
      kind: 'system',
      content: 'Alpha left the chat',
      system: {
        type: 'participant_left',
        participantId: agent.id,
        participantName: 'Alpha',
      },
    });
  });

  it('publishes a system message when the tab title changes', () => {
    const runtime = createRuntime();

    runtime.renameTab(runtime.getState().activeTabId, 'New topic');

    const messages = runtime
      .getTimelineEntries()
      .filter((entry) => entry.kind === 'message')
      .map((entry) => entry.message);

    expect(messages.at(-1)).toMatchObject({
      author: { type: 'system' },
      kind: 'system',
      content: 'Topic changed to: New topic',
      system: {
        type: 'topic_changed',
        topicTitle: 'New topic',
      },
    });
  });

  it('does not publish a system message for a no-op tab rename', () => {
    const runtime = createRuntime();
    const tab = runtime.getWorkspaceState().tabs[0]!;
    const beforeCount = runtime
      .getTimelineEntries()
      .filter((entry) => entry.kind === 'message').length;

    runtime.renameTab(tab.id, tab.title);

    const afterCount = runtime
      .getTimelineEntries()
      .filter((entry) => entry.kind === 'message').length;

    expect(afterCount).toBe(beforeCount);
  });
});
