import { describe, expect, it } from 'vitest';
import { createRuntime } from './helpers';

describe('MultiChatRuntime context routing', () => {
  it('routes private human messages only to addressed agent context', async () => {
    const runtime = createRuntime();
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
});
