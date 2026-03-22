import { describe, expect, it, vi } from 'vitest';
import { MultiChatRuntime } from '../../../src/core/runtime';
import { createRuntime, createTransport, timelineMessages } from './helpers';

describe('MultiChatRuntime history cutoffs', () => {
  it('manual reset excludes earlier messages from all agent contexts and keeps the full post-cutoff history', async () => {
    const runtime = createRuntime();
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

    await runtime.sendMessage({
      senderId: 'human',
      content: 'before reset',
      target: 'public',
      triggerSweep: false,
    });

    runtime.resetAgentHistoryContext();

    await runtime.sendMessage({
      senderId: 'human',
      content: 'after reset',
      target: 'public',
      triggerSweep: false,
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'after reset again',
      target: 'public',
      triggerSweep: false,
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'after reset once more',
      target: 'public',
      triggerSweep: false,
    });

    expect(
      runtime
        .getVisibleMessagesForAgent(alpha.id)
        .map((message) => message.content),
    ).toEqual(['after reset', 'after reset again', 'after reset once more']);
    expect(
      runtime
        .getVisibleMessagesForAgent(beta.id)
        .map((message) => message.content),
    ).toEqual(['after reset', 'after reset again', 'after reset once more']);
  });

  it('can permanently clear messages before the manual cutoff', async () => {
    const runtime = createRuntime();

    await runtime.sendMessage({
      senderId: 'human',
      content: 'before reset',
      target: 'public',
      triggerSweep: false,
    });

    runtime.resetAgentHistoryContext();

    await runtime.sendMessage({
      senderId: 'human',
      content: 'after reset',
      target: 'public',
      triggerSweep: false,
    });

    runtime.clearHistoryBeforeAgentCutoff();

    expect(timelineMessages(runtime).map((message) => message.content)).toEqual(
      ['after reset'],
    );
    expect(
      runtime
        .getTimelineEntries()
        .some(
          (entry) =>
            entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual',
        ),
    ).toBe(false);
  });

  it('can move the manual cutoff higher in the timeline', async () => {
    const runtime = createRuntime();

    await runtime.sendMessage({
      senderId: 'human',
      content: 'one',
      target: 'public',
      triggerSweep: false,
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'two',
      target: 'public',
      triggerSweep: false,
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'three',
      target: 'public',
      triggerSweep: false,
    });

    runtime.resetAgentHistoryContext();

    const firstMessageEntry = runtime
      .getTimelineEntries()
      .find(
        (entry) => entry.kind === 'message' && entry.message.content === 'two',
      );

    runtime.moveManualCutoffBefore(firstMessageEntry?.id ?? null);

    expect(
      runtime
        .getVisibleMessagesForAgent('id-1')
        .map((message) => message.content),
    ).toEqual(['two', 'three']);
  });

  it('can remove the manual cutoff without clearing chat history', async () => {
    const runtime = createRuntime();

    await runtime.sendMessage({
      senderId: 'human',
      content: 'before reset',
      target: 'public',
      triggerSweep: false,
    });

    runtime.resetAgentHistoryContext();

    await runtime.sendMessage({
      senderId: 'human',
      content: 'after reset',
      target: 'public',
      triggerSweep: false,
    });

    runtime.removeManualCutoff();

    expect(timelineMessages(runtime).map((message) => message.content)).toEqual(
      ['before reset', 'after reset'],
    );
    expect(
      runtime
        .getVisibleMessagesForAgent('id-1')
        .map((message) => message.content),
    ).toEqual(['before reset', 'after reset']);
  });

  it('keeps only the latest manual cutoff after repeated resets', async () => {
    const runtime = createRuntime();

    await runtime.sendMessage({
      senderId: 'human',
      content: 'before first reset',
      target: 'public',
      triggerSweep: false,
    });

    runtime.resetAgentHistoryContext();

    await runtime.sendMessage({
      senderId: 'human',
      content: 'between resets',
      target: 'public',
      triggerSweep: false,
    });

    runtime.resetAgentHistoryContext();

    await runtime.sendMessage({
      senderId: 'human',
      content: 'after second reset',
      target: 'public',
      triggerSweep: false,
    });

    const manualCutoffs = runtime
      .getTimelineEntries()
      .filter(
        (entry) =>
          entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual',
      );

    expect(manualCutoffs).toHaveLength(1);
    expect(
      runtime
        .getVisibleMessagesForAgent('id-1')
        .map((message) => message.content),
    ).toEqual(['after second reset']);
  });

  it('uses the full post-cutoff history when building agent context', async () => {
    const runtime = createRuntime();
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

    for (const content of ['one', 'two', 'three']) {
      await runtime.sendMessage({
        senderId: 'human',
        content,
        target: 'public',
        triggerSweep: false,
      });
    }

    runtime.resetAgentHistoryContext();

    for (const content of ['four', 'five', 'six', 'seven']) {
      await runtime.sendMessage({
        senderId: 'human',
        content,
        target: 'public',
        triggerSweep: false,
      });
    }

    expect(
      runtime
        .getVisibleMessagesForAgent(alpha.id)
        .map((message) => message.content),
    ).toEqual(['four', 'five', 'six', 'seven']);
    expect(
      runtime
        .getVisibleMessagesForAgent(beta.id)
        .map((message) => message.content),
    ).toEqual(['four', 'five', 'six', 'seven']);
  });

  it('persists manual cutoff state', () => {
    const save = vi.fn();
    const runtime = new MultiChatRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        action: { type: 'stay_silent', reason: 'noop' },
      })),
      storage: {
        load: () => ({
          settings: {
            openRouterApiKey: 'persisted-key',
          },
          debugLogs: [],
          errors: [],
          activeTabId: 'tab-1',
          tabs: [
            {
              id: 'tab-1',
              title: '#default',
              participants: [{ id: 'human', name: 'Human', role: 'human' }],
              agents: [],
              timeline: [
                {
                  id: 'm-1',
                  kind: 'message',
                  createdAt: '2026-03-16T10:00:00.000Z',
                  message: {
                    id: 'm-1',
                    author: { type: 'participant', participantId: 'human' },
                    kind: 'participant',
                    target: 'public',
                    content: 'persisted',
                    createdAt: '2026-03-16T10:00:00.000Z',
                  },
                },
                {
                  id: 'cutoff-1',
                  kind: 'history-cutoff',
                  createdAt: '2026-03-16T10:01:00.000Z',
                  cutoff: {
                    source: 'manual',
                  },
                },
              ],
              metrics: {},
              execution: {
                isSweepRunning: false,
                queuedSweep: false,
                sweepCount: 0,
                stopRequested: false,
              },
              requestTraces: {},
              messageInspectionIndex: {},
            },
          ],
        }),
        save,
        reset: vi.fn(),
      },
    });

    const state = runtime.getState();

    expect(
      state.timeline.find(
        (entry) =>
          entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual',
      ),
    ).toMatchObject({
      id: 'cutoff-1',
      createdAt: '2026-03-16T10:01:00.000Z',
    });
    expect(save).toHaveBeenCalled();
  });

  it('skips hidden disabled agents during sweeps', async () => {
    const seenAgentIds: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        seenAgentIds.push(agentId);
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'noop' },
        };
      }),
    });

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
    runtime.updateSettings({ openRouterApiKey: 'test-key' });
    runtime.removeAgent(beta.id);

    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello active agents',
      target: 'public',
      triggerSweep: false,
    });

    await runtime.runAgentSweep('manual');

    expect(seenAgentIds).toEqual([alpha.id]);
  });
});
