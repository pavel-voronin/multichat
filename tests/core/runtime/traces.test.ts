import { describe, expect, it } from 'vitest';
import {
  createRuntime,
  createTransport,
  timelineEvents,
  timelineMessages,
} from './helpers';

describe('MultiChatRuntime request traces', () => {
  it('records request traces and links produced agent messages back to the trace', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        action: { type: 'speak_public', text: 'trace hello' },
        usage: {
          promptTokens: 12,
          completionTokens: 4,
          totalTokens: 16,
          estimatedCost: 0.25,
          requestPayloadJson: { request: true },
          responsePayloadJson: { response: true },
          transportMeta: {
            provider: 'openrouter',
            modelId: 'model-a',
            executionMode: 'tools',
          },
        },
      })),
    });

    runtime.createAgent({
      name: 'TraceAgent',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      pricing: {
        prompt: '0.01',
      },
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'start tracing',
      target: 'public',
    });

    const messages = timelineMessages(runtime);
    const agentMessage = messages.at(-1)!;
    const trace = runtime.getRequestTrace(agentMessage.sourceTraceId!);

    expect(trace).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        producedMessageId: agentMessage.id,
        payloads: expect.objectContaining({
          requestInputJson: { request: true },
          responseOutputJson: { response: true },
          normalizedActionJson: { type: 'speak_public', text: 'trace hello' },
        }),
      }),
    );
    expect(agentMessage.sourceTraceId).toBe(trace?.id);
  });

  it('records private agent replies with recipient and produced trace link', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => ({
        mode: 'tools',
        action:
          agentId === 'id-1'
            ? { type: 'send_private', to: 'id-2', text: 'private trace hello' }
            : { type: 'stay_silent', reason: 'not addressed' },
      })),
    });

    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'model-b',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'coordinate privately',
      target: 'public',
    });

    const privateMessage = timelineMessages(runtime).find(
      (message) => message.target === 'private',
    );
    const trace = runtime.getRequestTrace(privateMessage!.sourceTraceId!);

    expect(privateMessage).toEqual(
      expect.objectContaining({
        target: 'private',
        recipientId: 'id-2',
        content: 'private trace hello',
      }),
    );
    expect(trace).toEqual(
      expect.objectContaining({
        producedMessageId: privateMessage!.id,
        payloads: expect.objectContaining({
          normalizedActionJson: {
            type: 'send_private',
            to: 'id-2',
            text: 'private trace hello',
          },
        }),
      }),
    );
  });

  it('indexes human messages by triggering traces before passive visible traces', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => ({
        mode: 'tools',
        action:
          agentId === 'id-1'
            ? { type: 'speak_public', text: 'alpha reply' }
            : { type: 'stay_silent', reason: 'observed' },
      })),
    });

    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'model-b',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const humanMessage = await runtime.sendMessage({
      senderId: 'human',
      content: 'fan out',
      target: 'public',
    });

    const inspection = runtime.getInspectionSubjectForMessage(humanMessage.id);

    expect(inspection.triggeringTraces).toHaveLength(2);
    expect(inspection.visibleOnlyTraces).toHaveLength(0);
    expect(inspection.downstreamTraces.map((trace) => trace.agentName)).toEqual(
      ['Alpha', 'Beta'],
    );
  });

  it('creates a linked fallback trace when tools fail', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (_agentId, mode) => {
        if (mode === 'tools') {
          throw new Error('tool unsupported');
        }

        return {
          mode: 'json',
          action: { type: 'stay_silent', reason: 'fallback ok' },
        };
      }),
    });

    runtime.createAgent({
      name: 'Fallback',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'force fallback',
      target: 'public',
    });

    const traces = Object.values(runtime.getDiagnosticsState().requestTraces);
    const toolsTrace = traces.find((trace) => trace.mode === 'tools');
    const fallbackTrace = traces.find((trace) => trace.mode === 'json');

    expect(toolsTrace?.status).toBe('failed');
    expect(fallbackTrace?.parentTraceId).toBe(toolsTrace?.id);
    expect(toolsTrace?.childTraceIds).toContain(fallbackTrace?.id);
  });

  it('completes the fallback trace when json fallback fails', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (_agentId, mode) => {
        if (mode === 'tools') {
          throw new Error('tool unsupported');
        }

        throw new Error('json fallback broke');
      }),
    });

    runtime.createAgent({
      name: 'Fallback',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'force fallback failure',
      target: 'public',
    });

    const traces = Object.values(runtime.getDiagnosticsState().requestTraces);
    const fallbackTrace = traces.find((trace) => trace.mode === 'json');
    const fallbackError = runtime
      .getDiagnosticsState()
      .errors.find((error) => error.message === 'JSON fallback failed');

    expect(fallbackTrace).toEqual(
      expect.objectContaining({
        status: 'failed',
        transport: expect.objectContaining({
          error: 'json fallback broke',
        }),
      }),
    );
    expect(fallbackError?.sourceTraceId).toBe(fallbackTrace?.id);
  });

  it('links silent technical events back to the request trace', async () => {
    const runtime = createRuntime();
    runtime.createAgent({
      name: 'Silent',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'stay quiet',
      target: 'public',
    });

    const silentEvent = timelineEvents(runtime).find(
      (event) => event.type === 'silent-decision',
    );

    expect(silentEvent?.sourceTraceId).toBeTruthy();
    expect(runtime.getRequestTrace(silentEvent!.sourceTraceId!)).toEqual(
      expect.objectContaining({
        status: 'succeeded',
      }),
    );
  });
});
