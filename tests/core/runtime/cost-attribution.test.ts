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
        action: { type: 'speak_public', text: 'priced reply' },
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
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
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
        action: { type: 'stay_silent', reason: 'priced noop' },
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
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');

    const silentDecision = timelineEvents(runtime).find(
      (event) => event.type === 'silent-decision',
    );

    expect(silentDecision).toMatchObject({
      type: 'silent-decision',
      details: 'priced noop',
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
            action: { type: 'speak_public', text: 'priced reply' },
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
          action: { type: 'stay_silent', reason: 'seen' },
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
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.createAgent({
      name: 'Reader',
      modelId: 'reader-model',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.002', completion: '0.02' },
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
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
            action: { type: 'stay_silent', reason: 'first reader' },
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
          action: { type: 'stay_silent', reason: 'second reader' },
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
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.createAgent({
      name: 'Reader B',
      modelId: 'reader-b',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.002', completion: '0.02' },
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
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

  it('prorates prompt cost across all listened messages in context', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        action: { type: 'stay_silent', reason: 'listened' },
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
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
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
