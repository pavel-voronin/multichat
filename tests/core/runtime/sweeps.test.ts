import { describe, expect, it } from 'vitest';
import type { AgentTurnResult } from '../../../src/core';
import {
  createRuntime,
  createTransport,
  timelineEvents,
  timelineMessages,
} from './helpers';

describe('MultiChatRuntime sweeps', () => {
  it('falls back to json mode when tools fail', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (_agentId, mode) => {
        if (mode === 'tools') {
          throw new Error('tool unsupported');
        }

        return {
          mode: 'json',
          action: { type: 'speak_public', text: 'json hello' },
          usage: { totalTokens: 10 },
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

    await runtime.runAgentSweep('manual');

    expect(timelineMessages(runtime)[0]?.content).toBe('json hello');
    expect(timelineMessages(runtime)[0]?.costUsd).toBeUndefined();
    expect(
      runtime
        .getDiagnosticsState()
        .errors.some((error) => error.message === 'Agent turn failed'),
    ).toBe(true);
  });

  it('keeps sweep order deterministic', async () => {
    const order: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        order.push(agentId);
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'ordered' },
        };
      }),
    });

    runtime.createAgent({
      name: 'A',
      modelId: 'a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.createAgent({
      name: 'B',
      modelId: 'b',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    const agentIds = runtime.getState().agents.map((agent) => agent.id);
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');

    expect(order).toEqual(agentIds);
  });

  it('continues with another sweep when later agents create messages', async () => {
    const turns: Record<string, number> = {};
    let alphaId = '';
    let betaId = '';
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns[agentId] = (turns[agentId] ?? 0) + 1;
        const visible = runtime
          .getVisibleMessagesForAgent(agentId)
          .map((message) => `${message.senderId}:${message.content}`);

        if (agentId === alphaId) {
          if (
            visible.some((message) => message === 'human:start debate') &&
            !visible.some((message) => message === `${betaId}:reply from beta`)
          ) {
            return {
              mode: 'tools',
              action: { type: 'speak_public', text: 'reply from alpha' },
            };
          }

          if (
            visible.some(
              (message) => message === `${betaId}:reply from beta`,
            ) &&
            !visible.some(
              (message) => message === `${alphaId}:follow-up from alpha`,
            )
          ) {
            return {
              mode: 'tools',
              action: { type: 'speak_public', text: 'follow-up from alpha' },
            };
          }
        }

        if (
          agentId === betaId &&
          visible.some(
            (message) => message === `${alphaId}:reply from alpha`,
          ) &&
          !visible.some((message) => message === `${betaId}:reply from beta`)
        ) {
          return {
            mode: 'tools',
            action: { type: 'speak_public', text: 'reply from beta' },
          };
        }

        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'done' },
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
    [alphaId, betaId] = runtime.getState().agents.map((agent) => agent.id);
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'start debate',
      target: 'public',
    });

    expect(timelineMessages(runtime).map((message) => message.content)).toEqual(
      [
        'start debate',
        'reply from alpha',
        'reply from beta',
        'follow-up from alpha',
      ],
    );
    expect(turns).toEqual({
      [alphaId]: 2,
      [betaId]: 2,
    });
  });

  it('does not let an agent repeat on unchanged visible context', async () => {
    let alphaId = '';
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        if (agentId === alphaId) {
          return {
            mode: 'tools',
            action: { type: 'speak_public', text: 'need more detail' },
          };
        }

        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'no input' },
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
    alphaId = runtime.getState().agents[0]!.id;
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: '1',
      target: 'public',
    });

    expect(timelineMessages(runtime).map((message) => message.content)).toEqual(
      ['1', 'need more detail'],
    );
  });

  it('does not rerun a speaking agent when its own reply displaces the prompt from a tiny window', async () => {
    const turns: string[] = [];
    let alphaId = '';
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns.push(agentId);

        if (agentId === alphaId) {
          return {
            mode: 'tools',
            action: { type: 'speak_public', text: 'answer once' },
          };
        }

        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'not addressed' },
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
    const agentIds = runtime.getState().agents.map((agent) => agent.id);
    alphaId = agentIds[0]!;
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'question',
      target: 'public',
    });

    expect(timelineMessages(runtime).map((message) => message.content)).toEqual(
      ['question', 'answer once'],
    );
    expect(turns).toEqual(agentIds);
  });

  it('stop aborts active sweep and clears queued execution', async () => {
    let abortSignal: AbortSignal | undefined;
    const runtime = createRuntime({
      transport: {
        async listModels() {
          return [];
        },
        async runAgentTurn(input) {
          abortSignal = input.signal;
          return await new Promise<AgentTurnResult>((resolve, reject) => {
            input.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
            setTimeout(
              () =>
                resolve({
                  mode: 'tools',
                  action: { type: 'stay_silent', reason: 'late' },
                }),
              200,
            );
          });
        },
      },
    });

    runtime.createAgent({
      name: 'Slow',
      modelId: 'slow',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const sweepPromise = runtime.runAgentSweep('manual');
    await new Promise((resolve) => setTimeout(resolve, 20));
    runtime.stop();
    await sweepPromise;

    expect(abortSignal?.aborted).toBe(true);
    expect(runtime.getState().execution.isSweepRunning).toBe(false);
    expect(runtime.getState().execution.queuedSweep).toBe(false);
    expect(
      timelineEvents(runtime).some((event) => event.type === 'sweep-stopped'),
    ).toBe(true);
  });
});
