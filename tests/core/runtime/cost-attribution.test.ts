import { describe, expect, it } from 'vitest';
import {
  createRuntime,
  createTransport,
  timelineEvents,
  timelineMessages,
} from './helpers';

describe('MultiChatRuntime cost attribution', () => {
  it('stores request cost on agent-authored messages', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        actions: [{ type: 'speak_public', text: 'priced reply' }],
        usage: {
          promptTokens: 5,
          completionTokens: 3,
          totalTokens: 8,
          estimatedCost: 0.00042,
        },
      })),
    });

    runtime.createAgent({
      name: 'Priced',
      modelId: 'm',
      systemPrompt: 'prompt',
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');

    expect(timelineMessages(runtime)[0]).toMatchObject({
      content: 'priced reply',
      costUsd: 0.00042,
    });
  });

  it('stores request and own prompt cost on silent decisions', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        actions: [],
        usage: {
          promptTokens: 5,
          completionTokens: 0,
          totalTokens: 5,
          estimatedCost: 0.00042,
        },
      })),
    });

    runtime.createAgent({
      name: 'Priced',
      modelId: 'm',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.01', completion: '0.08' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');

    const silentDecision = timelineEvents(runtime).find(
      (event) => event.kind === 'silent-decision',
    );

    expect(silentDecision).toMatchObject({
      kind: 'silent-decision',
      reason: 'stay_silent',
      requestCostUsd: 0.00042,
      ownPromptCostUsd: 0.05,
      costUsd: 0.00042,
    });
  });

  it('adds downstream prompt cost to agent-authored messages in the same sweep', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        if (agentId === 'id-1') {
          return {
            mode: 'tools',
            actions: [{ type: 'speak_public', text: 'priced reply' }],
            usage: {
              promptTokens: 10,
              completionTokens: 5,
              totalTokens: 15,
              estimatedCost: 0.5,
            },
          };
        }

        return {
          mode: 'tools',
          actions: [],
          usage: {
            promptTokens: 20,
            completionTokens: 0,
            totalTokens: 20,
            estimatedCost: 0.2,
          },
        };
      }),
    });

    runtime.createAgent({
      name: 'Author',
      modelId: 'author-model',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.01', completion: '0.08' },
    });
    runtime.createAgent({
      name: 'Reader',
      modelId: 'reader-model',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.002', completion: '0.02' },
    });
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const readerId = runtime
      .getState()
      .agents.find((agent) => agent.name === 'Reader')!.id;

    await runtime.runAgentSweep('manual');

    expect(timelineMessages(runtime)[0]).toMatchObject({
      content: 'priced reply',
      requestCostUsd: 0.5,
      downstreamPromptCostUsd: 0.04,
      costUsd: 0.54,
      downstreamPromptCostContributors: [
        {
          agentId: readerId,
          promptCostUsd: 0.04,
          listenCount: 1,
        },
      ],
    });
  });

  it('adds downstream prompt cost to human-authored messages read by other agents', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        if (agentId === 'id-1') {
          return {
            mode: 'tools',
            actions: [],
            usage: {
              promptTokens: 10,
              completionTokens: 0,
              totalTokens: 10,
              estimatedCost: 0.1,
            },
          };
        }

        return {
          mode: 'tools',
          actions: [],
          usage: {
            promptTokens: 20,
            completionTokens: 0,
            totalTokens: 20,
            estimatedCost: 0.2,
          },
        };
      }),
    });

    runtime.createAgent({
      name: 'Reader A',
      modelId: 'reader-a',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.001', completion: '0.01' },
    });
    runtime.createAgent({
      name: 'Reader B',
      modelId: 'reader-b',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.002', completion: '0.02' },
    });
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const [readerA, readerB] = runtime.getState().agents;

    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello team',
      target: 'public',
    });

    expect(timelineMessages(runtime)[0]).toMatchObject({
      content: 'hello team',
      downstreamPromptCostUsd: 0.05,
      costUsd: 0.05,
      downstreamPromptCostContributors: [
        {
          agentId: readerA!.id,
          promptCostUsd: 0.01,
          listenCount: 1,
        },
        {
          agentId: readerB!.id,
          promptCostUsd: 0.04,
          listenCount: 1,
        },
      ],
    });
  });

  it('distributes request cost proportionally by character length across multi-action messages', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        actions: [
          { type: 'speak_public', text: 'short' },      // 5 chars
          { type: 'speak_public', text: 'longer text' }, // 11 chars
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 3,
          totalTokens: 8,
          estimatedCost: 0.16,
        },
      })),
    });

    runtime.createAgent({
      name: 'Priced',
      modelId: 'm',
      systemPrompt: 'prompt',
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');

    const messages = timelineMessages(runtime).filter((m) => m.authorId !== 'human');
    expect(messages).toHaveLength(2);
    // 5/(5+11) = 0.3125, 11/(5+11) = 0.6875
    expect(messages[0]!.requestCostUsd).toBeCloseTo(0.16 * (5 / 16), 10);
    expect(messages[1]!.requestCostUsd).toBeCloseTo(0.16 * (11 / 16), 10);
    expect((messages[0]!.requestCostUsd ?? 0) + (messages[1]!.requestCostUsd ?? 0)).toBeCloseTo(
      0.16,
      10,
    );
  });

  it('prorates prompt cost across all listened messages in context', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        actions: [],
        usage: {
          promptTokens: 20,
          completionTokens: 0,
          totalTokens: 20,
          estimatedCost: 0.2,
        },
      })),
    });

    runtime.createAgent({
      name: 'Reader',
      modelId: 'reader-model',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.002', completion: '0.02' },
    });
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const readerId = runtime.getState().agents[0]!.id;

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

    await runtime.runAgentSweep('manual');

    expect(timelineMessages(runtime)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: 'one',
          downstreamPromptCostUsd: 0.02,
          downstreamPromptCostContributors: [
            {
              agentId: readerId,
              promptCostUsd: 0.02,
              listenCount: 1,
            },
          ],
        }),
        expect.objectContaining({
          content: 'two',
          downstreamPromptCostUsd: 0.02,
          downstreamPromptCostContributors: [
            {
              agentId: readerId,
              promptCostUsd: 0.02,
              listenCount: 1,
            },
          ],
        }),
      ]),
    );
  });
});
