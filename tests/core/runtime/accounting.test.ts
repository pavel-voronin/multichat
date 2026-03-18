import { describe, expect, it } from 'vitest';
import { createRuntime, createTransport } from './helpers';

describe('MultiChatRuntime accounting and logs', () => {
  it('accumulates usage metrics', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        action: { type: 'stay_silent', reason: 'metrics' },
        usage: {
          promptTokens: 5,
          completionTokens: 3,
          totalTokens: 8,
          estimatedCost: 0.12,
        },
      })),
    });

    const agent = runtime.createAgent({
      name: 'Meter',
      modelId: 'm',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');
    await runtime.runAgentSweep('manual');

    expect(runtime.getState().metrics[agent.id]).toMatchObject({
      requestCount: 2,
      promptTokens: 10,
      completionTokens: 6,
      totalTokens: 16,
      estimatedCost: 0.24,
    });
  });

  it('records detailed debug logs for turn scheduling and results', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        if (agentId === 'id-1') {
          return {
            mode: 'tools',
            action: { type: 'speak_public', text: 'logged reply' },
          };
        }

        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'observer' },
        };
      }),
    });

    runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'inspect this',
      target: 'public',
    });

    const debugLogs = runtime.getState().debugLogs;
    expect(
      debugLogs.some(
        (entry) =>
          entry.kind === 'turn-requested' &&
          entry.agentId === 'id-1' &&
          entry.triggeringMessageIds?.includes('id-3'),
      ),
    ).toBe(true);
    expect(
      debugLogs.some(
        (entry) =>
          entry.kind === 'turn-result' &&
          entry.agentId === 'id-1' &&
          entry.actionType === 'speak_public',
      ),
    ).toBe(true);
    expect(
      debugLogs.some(
        (entry) =>
          entry.kind === 'turn-result' &&
          entry.agentId === 'id-2' &&
          entry.actionType === 'stay_silent' &&
          entry.details === 'observer',
      ),
    ).toBe(true);
    expect(
      debugLogs.some(
        (entry) =>
          entry.kind === 'turn-skipped' &&
          entry.agentId === 'id-1' &&
          entry.skipReason === 'no_new_input',
      ),
    ).toBe(true);
  });
});
