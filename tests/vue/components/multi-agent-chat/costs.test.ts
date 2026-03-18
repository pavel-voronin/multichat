import { afterEach, describe, expect, it } from 'vitest';
import type { OpenRouterTransport } from '../../../../src/core';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat cost display', () => {
  it('toggles cost display mode from request cost to net cost', async () => {
    const runtime = createRuntime();
    const alphaId = runtime.getState().agents[0]?.id;
    const beta = runtime.createAgent({
      name: 'Beta',
      modelId: 'model-b:free',
      pricing: {
        prompt: '0.002',
        completion: '0.02',
      },
      systemPrompt: 'prompt',
      contextWindowSize: null,
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    await runtime.sendMessage({
      senderId: alphaId ?? 'unknown-agent',
      content: 'priced reply',
      target: 'public',
      requestCostUsd: 0.5,
      ownPromptCostUsd: 0.1,
      downstreamPromptCostUsd: 0.04,
      downstreamPromptCostContributors: [
        {
          agentId: beta.id,
          promptCostUsd: 0.04,
          listenCount: 1,
        },
      ],
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    expect(wrapper.text()).toContain('$0.5000');
    expect(wrapper.text()).not.toContain('req $0.5000');

    const costModeButton = wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text().includes('Cost: request'));
    expect(costModeButton).toBeDefined();

    await costModeButton!.trigger('click');

    expect(runtime.getState().settings.costDisplayMode).toBe('net');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('$0.4400');
    expect(wrapper.text()).not.toContain('req $0.5000');
    expect(wrapper.text()).not.toContain('-in $0.1000');
    expect(wrapper.text()).not.toContain('+out $0.0400');

    const costTrigger = wrapper.get('.message-cost-trigger');
    await costTrigger.trigger('mouseenter');

    expect(document.body.textContent).toContain('Net cost for <Alpha>');
    expect(document.body.textContent).toContain('Request');
    expect(document.body.textContent).toContain('Own input');
    expect(document.body.textContent).toContain('Readers (1)');
    expect(document.body.textContent).toContain('Beta x1');
    expect(document.body.textContent).toContain('Shown');
  });

  it('cycles cost mode to off and hides money', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'priced human message',
      target: 'public',
      downstreamPromptCostUsd: 0.02,
      downstreamPromptCostContributors: [
        {
          agentId: runtime.getState().agents[0]!.id,
          promptCostUsd: 0.02,
          listenCount: 1,
        },
      ],
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    const costModeButton = wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text().includes('Cost: request'));
    expect(costModeButton).toBeDefined();

    await costModeButton!.trigger('click');
    await costModeButton!.trigger('click');

    expect(runtime.getState().settings.costDisplayMode).toBe('off');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('$0.0200');
    expect(wrapper.find('.participant-price-trigger').exists()).toBe(false);
  });

  it('shows model pricing bubble next to participant name when money is enabled', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [{ id: 'model-a:free', name: 'Model A Free' }];
      },
      async runAgentTurn() {
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'noop' },
          usage: {
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
            estimatedCost: 0.1234,
          },
        };
      },
    };
    const runtime = createRuntime({ transport });
    await runtime.runAgentSweep('manual');

    const wrapper = mountChat(runtime);

    const priceTrigger = wrapper.get('.participant-price-trigger');
    expect(priceTrigger.text()).toContain('$0.1234');
    expect(wrapper.text()).toContain('$0.1234');

    await priceTrigger.trigger('mouseenter');
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Alpha');
    expect(document.body.textContent).toContain('Prompt');
    expect(document.body.textContent).toContain('Completion');
    expect(document.body.textContent).toContain('$0.0010');
    expect(document.body.textContent).toContain('$0.0100');
  });
});
