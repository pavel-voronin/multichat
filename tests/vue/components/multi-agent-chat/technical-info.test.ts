import { afterEach, describe, expect, it } from 'vitest';
import type { OpenRouterTransport } from '../../../../src/core';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat technical info', () => {
  it('keeps technical info hidden by default', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ openRouterApiKey: 'key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    expect(wrapper.text()).toContain('Technical info: off');
    expect(wrapper.text()).not.toContain('stayed silent: noop');
  });

  it('shows silent reasons after enabling technical info', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ openRouterApiKey: 'key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    const technicalInfoButton = wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text().includes('Technical info: off'));

    expect(technicalInfoButton).toBeDefined();
    await technicalInfoButton!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Technical info: on');
    expect(wrapper.text()).toContain('[silent Alpha] stayed silent: noop');
  });

  it('shows cost for silent decisions after enabling technical info', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [{ id: 'model-a:free', name: 'Model A Free', context_length: 128000, supported_parameters: ['tools'] }];
      },
      async runAgentTurn() {
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'priced noop' },
          usage: {
            promptTokens: 10,
            completionTokens: 0,
            totalTokens: 10,
            estimatedCost: 0.5,
          },
        };
      },
    };

    const runtime = createRuntime({ transport });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    const technicalInfoButton = wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text().includes('Technical info: off'));

    expect(technicalInfoButton).toBeDefined();
    await technicalInfoButton!.trigger('click');
    await wrapper.vm.$nextTick();

    const silentCostTrigger = wrapper
      .findAll('.runtime-line .message-cost-trigger')
      .find((node) => node.text() === '$0.5000');

    expect(silentCostTrigger).toBeDefined();
    expect(wrapper.text()).toContain(
      '[silent Alpha] $0.5000 stayed silent: priced noop',
    );
  });

  it('shows runtime errors inside technical info', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [{ id: 'model-a:free', name: 'Model A Free', context_length: 128000, supported_parameters: ['tools'] }];
      },
      async runAgentTurn() {
        throw new Error('upstream 502');
      },
    };

    const runtime = createRuntime({ transport });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'Hello world',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    const technicalInfoButton = wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text().includes('Technical info: off'));

    expect(technicalInfoButton).toBeDefined();
    await technicalInfoButton!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain(
      '[error Alpha] request failed: upstream 502',
    );
  });
});
