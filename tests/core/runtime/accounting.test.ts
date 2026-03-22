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
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
    });
    const [alphaId, betaId] = runtime
      .getState()
      .agents.map((agent) => agent.id);
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const triggerMessage = await runtime.sendMessage({
      senderId: 'human',
      content: 'inspect this',
      target: 'public',
    });

    const debugLogs = runtime.getDiagnosticsState().debugLogs;
    expect(
      debugLogs.some(
        (entry) =>
          entry.kind === 'turn-requested' &&
          entry.agentId === alphaId &&
          entry.triggeringMessageIds?.includes(triggerMessage.id),
      ),
    ).toBe(true);
    expect(
      debugLogs.some(
        (entry) =>
          entry.kind === 'turn-result' &&
          entry.agentId === alphaId &&
          entry.actionType === 'speak_public',
      ),
    ).toBe(true);
    expect(
      debugLogs.some(
        (entry) =>
          entry.kind === 'turn-result' &&
          entry.agentId === betaId &&
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

  it('records debug logs for private replies with recipient metadata', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => ({
        mode: 'tools',
        action:
          agentId === 'id-1'
            ? { type: 'send_private', to: 'id-2', text: 'logged private' }
            : { type: 'stay_silent', reason: 'observer' },
      })),
    });

    runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
    });
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'reply privately',
      target: 'public',
    });

    const debugLogs = runtime.getDiagnosticsState().debugLogs;
    expect(
      debugLogs.some(
        (entry) =>
          entry.kind === 'turn-result' &&
          entry.agentId === 'id-1' &&
          entry.actionType === 'send_private' &&
          entry.target === 'private' &&
          entry.recipientId === 'id-2' &&
          entry.content === 'logged private',
      ),
    ).toBe(true);
  });
});
