import { describe, expect, it, vi } from 'vitest';
import { MultiChatRuntime } from '../src/core/runtime';
import type {
  AgentTurnResult,
  ChatMessage,
  OpenRouterTransport,
  RuntimeConfig,
  RuntimeEvent,
  TimelineMessageEntry,
  TimelineTechnicalEventEntry,
} from '../src/core';

function createTransport(
  handler: (
    agentId: string,
    mode: 'tools' | 'json',
  ) => Promise<AgentTurnResult>,
): OpenRouterTransport {
  return {
    async listModels() {
      return [];
    },
    async runAgentTurn(input) {
      return handler(input.context.agent.id, input.mode);
    },
  };
}

function createRuntime(config?: Partial<RuntimeConfig>) {
  return new MultiChatRuntime({
    transport: createTransport(async () => ({
      mode: 'tools',
      action: { type: 'stay_silent', reason: 'noop' },
    })),
    storage: {
      load: () => null,
      save: vi.fn(),
      reset: vi.fn(),
    },
    now: () => new Date('2026-03-16T10:00:00.000Z'),
    idGenerator: (() => {
      let counter = 0;
      return () => `id-${++counter}`;
    })(),
    ...config,
  });
}

function timelineMessages(runtime: MultiChatRuntime): ChatMessage[] {
  return runtime
    .getTimelineEntries()
    .filter((entry): entry is TimelineMessageEntry => entry.kind === 'message')
    .map((entry) => entry.message);
}

function timelineEvents(runtime: MultiChatRuntime): RuntimeEvent[] {
  return runtime
    .getTimelineEntries()
    .filter(
      (entry): entry is TimelineTechnicalEventEntry =>
        entry.kind === 'technical-event',
    )
    .map((entry) => entry.event);
}

describe('MultiChatRuntime', () => {
  it('routes private human messages only to addressed agent context', async () => {
    const seenByAgents: Record<string, string[]> = {};
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        seenByAgents[agentId] = runtime
          .getVisibleMessagesForAgent(agentId)
          .map((message) => message.content);
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'done' },
        };
      }),
    });

    const alpha = runtime.createAgent({
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

    await runtime.sendMessage({
      senderId: 'human',
      content: 'secret',
      target: 'private',
      recipientId: alpha.id,
    });

    expect(
      runtime
        .getVisibleMessagesForAgent(alpha.id)
        .map((message) => message.content),
    ).toContain('secret');
    expect(
      runtime
        .getVisibleMessagesForAgent('id-2')
        .map((message) => message.content),
    ).not.toContain('secret');
  });

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
        .getState()
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
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');

    expect(order).toEqual(['id-1', 'id-2']);
  });

  it('continues with another sweep when later agents create messages', async () => {
    const turns: Record<string, number> = {};
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns[agentId] = (turns[agentId] ?? 0) + 1;
        const visible = runtime
          .getVisibleMessagesForAgent(agentId)
          .map((message) => `${message.senderId}:${message.content}`);

        if (agentId === 'id-1') {
          if (
            visible.some((message) => message === 'human:start debate') &&
            !visible.some((message) => message === 'id-2:reply from beta')
          ) {
            return {
              mode: 'tools',
              action: { type: 'speak_public', text: 'reply from alpha' },
            };
          }

          if (
            visible.some((message) => message === 'id-2:reply from beta') &&
            !visible.some((message) => message === 'id-1:follow-up from alpha')
          ) {
            return {
              mode: 'tools',
              action: { type: 'speak_public', text: 'follow-up from alpha' },
            };
          }
        }

        if (
          agentId === 'id-2' &&
          visible.some((message) => message === 'id-1:reply from alpha') &&
          !visible.some((message) => message === 'id-2:reply from beta')
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
      'id-1': 2,
      'id-2': 2,
    });
  });

  it('does not let an agent repeat on unchanged visible context', async () => {
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        if (agentId === 'id-1') {
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
    const runtime = createRuntime({
      transport: createTransport(async (agentId) => {
        turns.push(agentId);

        if (agentId === 'id-1') {
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
      contextWindowSize: 1,
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
      content: 'question',
      target: 'public',
    });

    expect(timelineMessages(runtime).map((message) => message.content)).toEqual(
      ['question', 'answer once'],
    );
    expect(turns).toEqual(['id-1', 'id-2']);
  });

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
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');

    expect(timelineMessages(runtime)[0]).toMatchObject({
      content: 'priced reply',
      requestCostUsd: 0.5,
      downstreamPromptCostUsd: 0.04,
      costUsd: 0.54,
      downstreamPromptCostContributors: [
        {
          agentId: 'id-2',
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
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

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
          agentId: 'id-1',
          promptCostUsd: 0.01,
          listenCount: 1,
        },
        {
          agentId: 'id-2',
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
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

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
              agentId: 'id-1',
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
              agentId: 'id-1',
              promptCostUsd: 0.02,
              listenCount: 1,
            },
          ],
        }),
      ]),
    );
  });

  it('includes agent-authored messages in that agent context', async () => {
    const runtime = createRuntime();
    const agent = runtime.createAgent({
      name: 'Selfless',
      modelId: 'm',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello',
      target: 'public',
      triggerSweep: false,
    });
    await runtime.sendMessage({
      senderId: agent.id,
      content: 'my own reply',
      target: 'public',
      triggerSweep: false,
    });

    expect(
      runtime
        .getVisibleMessagesForAgent(agent.id)
        .map((message) => message.content),
    ).toEqual(['hello', 'my own reply']);
  });

  it('uses per-agent context window override before global default', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ defaultContextWindowSize: 3 });
    const agent = runtime.createAgent({
      name: 'Windowed',
      modelId: 'm',
      systemPrompt: 'prompt',
      contextWindowSize: 2,
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });

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

    expect(
      runtime
        .getVisibleMessagesForAgent(agent.id)
        .map((message) => message.content),
    ).toEqual(['two', 'three']);
  });

  it('manual reset excludes earlier messages from all agent contexts', async () => {
    const runtime = createRuntime();
    const alpha = runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    const beta = runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
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

    expect(
      runtime
        .getVisibleMessagesForAgent(alpha.id)
        .map((message) => message.content),
    ).toEqual(['after reset']);
    expect(
      runtime
        .getVisibleMessagesForAgent(beta.id)
        .map((message) => message.content),
    ).toEqual(['after reset']);
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

  it('combines manual reset with per-agent and global windows in preview cutoffs', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ defaultContextWindowSize: 3 });
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
      contextWindowSize: 1,
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
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

    for (const content of ['four', 'five']) {
      await runtime.sendMessage({
        senderId: 'human',
        content,
        target: 'public',
        triggerSweep: false,
      });
    }

    expect(
      runtime
        .getVisibleMessagesForAgent('id-1')
        .map((message) => message.content),
    ).toEqual(['four', 'five']);
    expect(
      runtime
        .getVisibleMessagesForAgent('id-2')
        .map((message) => message.content),
    ).toEqual(['five']);

    const alphaVisibleMessages = runtime.getVisibleMessagesForAgent('id-1');
    const betaVisibleMessages = runtime.getVisibleMessagesForAgent('id-2');
    expect(runtime.getAgentContextCutoffs()).toEqual([
      {
        anchor: {
          kind: 'before-message',
          messageId: alphaVisibleMessages[0].id,
        },
        agentIds: ['id-1'],
        agentNames: ['Alpha'],
        usesGlobalWindow: true,
      },
      {
        anchor: {
          kind: 'before-message',
          messageId: betaVisibleMessages[0].id,
        },
        agentIds: ['id-2'],
        agentNames: ['Beta'],
        usesGlobalWindow: false,
      },
    ]);
  });

  it('persists manual cutoff and cutoff preview settings', () => {
    const save = vi.fn();
    const runtime = new MultiChatRuntime({
      transport: createTransport(async () => ({
        mode: 'tools',
        action: { type: 'stay_silent', reason: 'noop' },
      })),
      storage: {
        load: () => ({
          timeline: [
            {
              id: 'm-1',
              kind: 'message',
              createdAt: '2026-03-16T10:00:00.000Z',
              message: {
                id: 'm-1',
                senderId: 'human',
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
          settings: {
            openRouterApiKey: 'persisted-key',
            defaultContextWindowSize: 5,
            showContextCutoffs: true,
            showSilentDecisions: false,
            costDisplayMode: 'request',
          },
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
    expect(state.settings.showContextCutoffs).toBe(true);
    expect(save).toHaveBeenCalled();
  });

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

  it('skips hidden disabled agents during sweeps and cutoff previews', async () => {
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
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    const beta = runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
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
    expect(runtime.getAgentContextCutoffs()).toEqual([
      expect.objectContaining({
        agentIds: [alpha.id],
        agentNames: ['Alpha'],
      }),
    ]);
  });

  it('labels preview cutoff as all agents when all active agents share one cutoff', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ defaultContextWindowSize: 1 });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    const beta = runtime.createAgent({
      name: 'Beta',
      modelId: 'b',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });

    runtime.removeAgent(beta.id);

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

    const previewCutoff = runtime
      .getVisibleTimelineEntries({
        participantId: 'human',
        filters: { showPreviewCutoffs: true },
      })
      .find(
        (entry) =>
          entry.kind === 'history-cutoff' && entry.cutoff.source === 'preview',
      );

    expect(previewCutoff).toBeDefined();
    expect(
      previewCutoff && previewCutoff.kind === 'history-cutoff'
        ? previewCutoff.cutoff.label
        : '',
    ).toBe('context for: all agents');
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

    const traces = Object.values(runtime.getState().requestTraces);
    const toolsTrace = traces.find((trace) => trace.mode === 'tools');
    const fallbackTrace = traces.find((trace) => trace.mode === 'json');

    expect(toolsTrace?.status).toBe('failed');
    expect(fallbackTrace?.parentTraceId).toBe(toolsTrace?.id);
    expect(toolsTrace?.childTraceIds).toContain(fallbackTrace?.id);
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
