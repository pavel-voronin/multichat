import { afterEach, describe, expect, it } from 'vitest';
import { MultiChatRuntime } from '../../../../src/core/runtime';
import type { OpenRouterTransport } from '../../../../src/core';
import { createRuntime, mountChat, setTechnicalInfoVisible } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat request inspection', () => {
  it('opens request inspection for a human message even when no agents exist', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'solo message',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    await wrapper.get('.message-time-trigger-active').trigger('click');

    expect(document.body.textContent).toContain('Human message');
    expect(document.body.textContent).toContain('solo message');
    expect(document.body.textContent).toContain('Downstream traces');
  });

  it('opens request inspection for a human message from the timestamp', async () => {
    const runtime = createRuntime({
      createDefaultAgent: false,
      setApiKey: false,
    });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'model-b:free',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'key' });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'inspect me',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    await wrapper.get('.message-time-trigger-active').trigger('click');

    expect(document.body.textContent).toContain('Human message');
    expect(document.body.textContent).toContain('Downstream traces');
    expect(document.body.textContent).toContain('Triggered by this message');
    expect(document.body.textContent).toContain('Alpha · tools · succeeded');
  });

  it('opens the single downstream silent trace directly from a human message timestamp', async () => {
    const runtime = createRuntime({
      createDefaultAgent: false,
      setApiKey: false,
    });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'key' });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'one silent reader',
      target: 'private',
      recipientId: runtime.getState().agents[0]!.id,
    });

    const wrapper = mountChat(runtime);

    await wrapper.get('.message-time-trigger-active').trigger('click');

    expect(document.body.textContent).toContain('Request trace');
    expect(document.body.textContent).toContain('Alpha · tools');
    expect(document.body.textContent).toContain('stayed silent: noop');
  });

  it('shows silent outcome details inside request inspection', async () => {
    const runtime = createRuntime({
      createDefaultAgent: false,
      setApiKey: false,
    });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.resetAgentHistoryContext();
    runtime.updateSettings({ openRouterApiKey: 'key' });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'should stay silent',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    await wrapper.get('.message-time-trigger-active').trigger('click');
    const traceButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((button) =>
      button.textContent?.includes('Alpha · tools · succeeded'),
    ) as HTMLButtonElement | undefined;
    expect(traceButton).toBeDefined();

    traceButton?.click();
    await wrapper.vm.$nextTick();

    const outputTab = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Output',
    ) as HTMLButtonElement | undefined;
    expect(outputTab).toBeDefined();

    outputTab?.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Silent outcome');
    expect(document.body.textContent).toContain('Stayed silent: noop');
    expect(document.body.textContent).toContain(
      'Silent decision with reason: noop',
    );
  });

  it('opens request inspection from a silent technical event timestamp', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'stay silent please',
      target: 'public',
    });

    const wrapper = mountChat(runtime, {
      configure: (pinia) => {
        setTechnicalInfoVisible(pinia);
      },
    });

    await wrapper
      .get('.runtime-line .message-time-trigger-active')
      .trigger('click');

    expect(document.body.textContent).toContain('Request trace');
    expect(document.body.textContent).toContain('Alpha · tools');
    expect(document.body.textContent).toContain('stayed silent: noop');
  });

  it('opens source trace inspection for an agent message from the timestamp', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [{ id: 'model-a:free', name: 'Model A Free' }];
      },
      async runAgentTurn() {
        return {
          mode: 'tools',
          action: { type: 'speak_public', text: 'trace reply' },
          usage: {
            promptTokens: 8,
            completionTokens: 2,
            totalTokens: 10,
            estimatedCost: 0.05,
          },
        };
      },
    };
    const runtime = createRuntime({ transport });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'please answer',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    await wrapper.findAll('.message-time-trigger-active')[1]!.trigger('click');

    expect(document.body.textContent).toContain('Request trace');
    expect(document.body.textContent).toContain('Alpha · tools');
    expect(document.body.textContent).toContain('produced');
    expect(document.body.textContent).toContain('trace reply');
  });
});
