import { describe, expect, it } from 'vitest';
import type { AgentTurnResult } from '../../../src/core';
import {
  createRuntime,
  createTransport,
  timelineEvents,
  timelineMessages,
} from './helpers';

describe('MultiChatRuntime sweeps', () => {
  it('reports error when agent turn fails, no fallback', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => {
        throw new Error('tool unsupported');
      }),
    });
    runtime.createAgent({
      name: 'Fallback',
      modelId: 'model-a',
      systemPrompt: 'prompt',
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');

    expect(
      runtime
        .getDiagnosticsState()
        .errors.some((error) => error.message === 'Agent turn failed'),
    ).toBe(true);
    expect(timelineMessages(runtime)).toHaveLength(0);
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
    });
    runtime.createAgent({
      name: 'B',
      modelId: 'b',
      systemPrompt: 'prompt',
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
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
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

  it('stops automatic chaining after the chat max auto-rounds limit', async () => {
    const turns: Record<string, number> = {};
    let alphaId = '';
    let betaId = '';
    const runtime = createRuntime({
      maxAutoSweeps: 1,
      transport: createTransport(async (agentId) => {
        turns[agentId] = (turns[agentId] ?? 0) + 1;
        const visible = runtime
          .getVisibleMessagesForAgent(agentId)
          .map((message) => `${message.senderId}:${message.content}`);

        if (
          agentId === alphaId &&
          visible.some((message) => message === 'human:start') &&
          !visible.some((message) => message === `${alphaId}:reply from alpha`)
        ) {
          return {
            mode: 'tools',
            action: { type: 'speak_public', text: 'reply from alpha' },
          };
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
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
    });
    [alphaId, betaId] = runtime.getState().agents.map((agent) => agent.id);
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'start',
      target: 'public',
    });

    expect(timelineMessages(runtime).map((message) => message.content)).toEqual(
      ['start', 'reply from alpha', 'reply from beta'],
    );
    expect(turns).toEqual({
      [alphaId]: 1,
      [betaId]: 1,
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
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
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
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
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
      timelineEvents(runtime).some((event) => event.kind === 'sweep-stopped'),
    ).toBe(true);
  });

  it('applies mention boost on top of configured strategy', async () => {
    const order: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        order.push(
          runtime.getState().agents.find((agent) => agent.id === agentId)
            ?.name ?? agentId,
        );
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'ordered' },
        };
      }),
    });

    runtime.createAgent({
      name: 'Cheap',
      modelId: 'cheap',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.1', completion: '0.1' },
    });
    runtime.createAgent({
      name: 'Mid',
      modelId: 'mid',
      systemPrompt: 'prompt',
      pricing: { prompt: '1', completion: '1' },
    });
    runtime.createAgent({
      name: 'Expensive',
      modelId: 'expensive',
      systemPrompt: 'prompt',
      pricing: { prompt: '2', completion: '2' },
    });
    runtime.updateTurnOrdering({ strategy: 'cheap_first' });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'Expensive: check this',
      target: 'public',
    });

    expect(order).toEqual(['Expensive', 'Cheap', 'Mid']);
  });

  it('private message triggers a sweep that runs all agents, only recipient gets new visible input', async () => {
    const order: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        order.push(
          runtime.getState().agents.find((agent) => agent.id === agentId)
            ?.name ?? agentId,
        );
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'ordered' },
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
    runtime.updateSettings({ openRouterApiKey: 'test-key' });
    const betaId = runtime
      .getState()
      .agents.find((agent) => agent.name === 'Beta')!.id;

    await runtime.sendMessage({
      senderId: 'human',
      content: 'private ping',
      target: 'private',
      recipientId: betaId,
    });

    expect(order).toEqual(['Alpha', 'Beta']);
  });

  it('advances sliding cycle offset after completed sweeps only', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        action: { type: 'stay_silent', reason: 'ordered' },
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
    runtime.updateTurnOrdering({
      strategy: 'sliding_cycle',
      offset: 0,
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');
    expect(runtime.getState().turnOrdering).toEqual({
      strategy: 'sliding_cycle',
      offset: 1,
    });

    runtime.stop();
    expect(runtime.getState().turnOrdering).toEqual({
      strategy: 'sliding_cycle',
      offset: 1,
    });
  });

  it('non-message sweep is not restricted by a prior private message', async () => {
    const turns: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns.push(
          runtime.getState().agents.find((agent) => agent.id === agentId)
            ?.name ?? agentId,
        );
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'test' },
        };
      }),
    });

    runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
    });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const betaId = runtime.getState().agents.find((a) => a.name === 'Beta')!.id;

    await runtime.sendMessage({
      senderId: 'human',
      content: 'private ping',
      target: 'private',
      recipientId: betaId,
    });

    turns.length = 0;

    runtime.renameTab(runtime.getState().activeTabId, '#renamed');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(turns).toEqual(['Alpha', 'Beta']);
  });

  it('sendMessage sweep uses the sent entry as triggeringMessage for mention boost', async () => {
    const turns: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns.push(
          runtime.getState().agents.find((agent) => agent.id === agentId)
            ?.name ?? agentId,
        );
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'test' },
        };
      }),
    });

    runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
    });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'Beta: please respond',
      target: 'public',
    });

    expect(turns).toEqual(['Beta', 'Alpha']);
  });

  it('private sendMessage triggers a sweep that runs all agents, only recipient gets new visible input', async () => {
    const turns: string[] = [];
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns.push(
          runtime.getState().agents.find((agent) => agent.id === agentId)
            ?.name ?? agentId,
        );
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'test' },
        };
      }),
    });

    runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
    });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    const betaId = runtime.getState().agents.find((a) => a.name === 'Beta')!.id;

    await runtime.sendMessage({
      senderId: 'human',
      content: 'private ping',
      target: 'private',
      recipientId: betaId,
    });

    expect(turns).toEqual(['Alpha', 'Beta']);
  });

  it('queued sweep uses the message that arrived during the sweep, not the original trigger', async () => {
    const allTurns: string[] = [];
    let gammaId = '';

    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        allTurns.push(
          runtime.getState().agents.find((a) => a.id === agentId)?.name ??
            agentId,
        );

        if (agentId === gammaId) {
          const visible = runtime.getVisibleMessagesForAgent(agentId);
          const hasSpoken = visible.some((m) => m.senderId === gammaId);
          if (!hasSpoken) {
            return {
              mode: 'tools',
              action: { type: 'speak_public', text: 'Beta: your turn' },
            };
          }
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
    });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.createAgent({
      name: 'Gamma',
      modelId: 'c',
      systemPrompt: 'prompt',
    });
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'test-key' });
    gammaId = runtime.getState().agents[2]!.id;

    await runtime.sendMessage({
      senderId: 'human',
      content: 'start',
      target: 'public',
    });

    expect(allTurns).toEqual(['Alpha', 'Beta', 'Gamma', 'Beta', 'Alpha']);
  });

  it('agent with new public input gets a turn when a later agent sends private to someone else', async () => {
    const callsPerSweep: Record<number, string[]> = {};
    let betaId = '';
    let gammaId = '';

    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        const state = runtime.getState();
        const sweep = state.execution.sweepCount;
        const name = state.agents.find((a) => a.id === agentId)?.name ?? agentId;
        (callsPerSweep[sweep] ??= []).push(name);

        // Beta sends public "from beta" on its first turn
        if (agentId === betaId) {
          const visible = runtime.getVisibleMessagesForAgent(agentId);
          if (!visible.some((m) => m.senderId === betaId)) {
            return {
              mode: 'tools',
              action: { type: 'speak_public', text: 'from beta' },
            };
          }
        }

        // Gamma sends private to Beta on its first turn (after seeing "from beta")
        if (agentId === gammaId) {
          const visible = runtime.getVisibleMessagesForAgent(agentId);
          if (
            visible.some((m) => m.senderId === betaId) &&
            !visible.some((m) => m.senderId === gammaId)
          ) {
            return {
              mode: 'tools',
              action: { type: 'send_private', text: 'hey beta', to: betaId },
            };
          }
        }

        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'done' },
        };
      }),
    });

    runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: 'prompt' });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.createAgent({ name: 'Gamma', modelId: 'c', systemPrompt: 'prompt' });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    [, betaId, gammaId] = runtime.getState().agents.map((a) => a.id);

    await runtime.sendMessage({
      senderId: 'human',
      content: 'start',
      target: 'public',
    });

    // Sweep 1: Alpha stayed silent (no input yet when it ran),
    // Beta sent public "from beta", Gamma sent private to Beta
    expect(callsPerSweep[1]).toEqual(['Alpha', 'Beta', 'Gamma']);

    // Sweep 2: Gamma's private to Beta was the last message in sweep 1.
    // Alpha ran before "from beta" appeared → "from beta" is new for Alpha.
    // Beta has Gamma's private as new input.
    // Gamma has no new visible input (cannot see its own private in non-self context).
    // Both Alpha and Beta must get a turn — Alpha must not be suppressed.
    expect(callsPerSweep[2]).toEqual(['Alpha', 'Beta']);
  });

  it('agent-to-agent private: only the recipient gets a turn in the subsequent sweep', async () => {
    const callsPerSweep: Record<number, string[]> = {};
    let alphaId = '';
    let betaId = '';

    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        const state = runtime.getState();
        const sweep = state.execution.sweepCount;
        const name = state.agents.find((a) => a.id === agentId)?.name ?? agentId;
        (callsPerSweep[sweep] ??= []).push(name);

        // Beta sends private to Alpha on its first turn
        if (agentId === betaId) {
          const visible = runtime.getVisibleMessagesForAgent(agentId);
          if (!visible.some((m) => m.senderId === betaId)) {
            return {
              mode: 'tools',
              action: { type: 'send_private', text: 'just for you', to: alphaId },
            };
          }
        }

        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'done' },
        };
      }),
    });

    runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: 'prompt' });
    runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: 'prompt' });
    runtime.createAgent({ name: 'Gamma', modelId: 'c', systemPrompt: 'prompt' });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    [alphaId, betaId] = runtime.getState().agents.map((a) => a.id);

    await runtime.sendMessage({
      senderId: 'human',
      content: 'start',
      target: 'public',
    });

    // Sweep 1: all three agents see "start" and get called (first-ever run).
    // Beta sends private to Alpha.
    expect(callsPerSweep[1]).toEqual(['Alpha', 'Beta', 'Gamma']);

    // Sweep 2: only Alpha has new visible input (Beta's private message).
    // Gamma cannot see the private message → no new input → correctly not called.
    expect(callsPerSweep[2]).toEqual(['Alpha']);
  });
});
