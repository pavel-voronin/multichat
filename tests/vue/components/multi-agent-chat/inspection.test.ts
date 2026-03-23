import { afterEach, describe, expect, it } from 'vitest';
import type { OpenRouterTransport } from '../../../../src/core';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat request inspection', () => {
  it('opens inspector for a human message showing Agent / Request / Result tabs', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello world',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.message-time-trigger-active').trigger('click');

    expect(document.body.textContent).toContain('Agent');
    expect(document.body.textContent).toContain('Request');
    expect(document.body.textContent).toContain('Result');
  });

  it('shows author name and timestamp in the inspector header', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'header test',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.message-time-trigger-active').trigger('click');

    // Human participant name ("Human" is the default human sender label)
    expect(document.body.textContent).toMatch(/Human/);
  });

  it('shows N/A for model and no system prompt for a human message on Agent tab', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'human with no agents',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.message-time-trigger-active').trigger('click');

    // Agent tab should be active by default, model shows —
    expect(document.body.textContent).toContain('Model');
    expect(document.body.textContent).toContain('—');
  });

  it('shows no request data on Request tab for a human message', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'no trace',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.message-time-trigger-active').trigger('click');

    // Switch to Request tab
    const requestTab = Array.from(
      document.body.querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'Request');
    expect(requestTab).toBeDefined();
    requestTab!.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('No request data');
  });

  it('opens inspector for an agent message showing model and system prompt on Agent tab', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [
          {
            id: 'model-a:free',
            name: 'Model A Free',
            context_length: 128000,
            supported_parameters: ['tools'],
          },
        ];
      },
      async runAgentTurn() {
        return {
          mode: 'tools',
          action: { type: 'speak_public', text: 'agent reply' },
          usage: { promptTokens: 10, completionTokens: 5, requestCostUsd: 0.001 },
        };
      },
    };

    const runtime = createRuntime({ transport });
    runtime.getState().agents[0]!; // ensure Alpha exists
    await runtime.sendMessage({
      senderId: 'human',
      content: 'please answer',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    // Click the second message timestamp (the agent's reply)
    const triggers = wrapper.findAll('.message-time-trigger-active');
    await triggers[1]!.trigger('click');

    // Agent tab: model id should be visible
    expect(document.body.textContent).toContain('model-a:free');
    // System prompt
    expect(document.body.textContent).toContain('prompt');
  });

  it('shows speak_public action in Result tab for an agent message', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [
          {
            id: 'model-a:free',
            name: 'Model A Free',
            context_length: 128000,
            supported_parameters: ['tools'],
          },
        ];
      },
      async runAgentTurn() {
        return {
          mode: 'tools',
          action: { type: 'speak_public', text: 'agent reply' },
          usage: { promptTokens: 10, completionTokens: 5, requestCostUsd: 0.001 },
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
    const triggers = wrapper.findAll('.message-time-trigger-active');
    await triggers[1]!.trigger('click');

    const resultTab = Array.from(
      document.body.querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'Result');
    resultTab!.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Published to public chat');
  });

  it('shows no request data on Result tab for a human message', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'human result tab',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.message-time-trigger-active').trigger('click');

    const resultTab = Array.from(
      document.body.querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'Result');
    resultTab!.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('No request data');
  });

  it('shows stay_silent action in Result tab for an agent message', async () => {
    const runtime = createRuntime(); // default transport returns stay_silent: noop
    await runtime.sendMessage({
      senderId: 'human',
      content: 'should stay silent',
      target: 'public',
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.message-time-trigger-active').trigger('click');
    expect(document.body.textContent).toContain('Agent');
  });

  it('back button is disabled when inspector first opens', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'nav test',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.message-time-trigger-active').trigger('click');

    const backBtn = document.body.querySelector(
      'button[aria-label="Back"]',
    ) as HTMLButtonElement | null;
    expect(backBtn).not.toBeNull();
    expect(backBtn!.disabled).toBe(true);
  });

  it('back button becomes active after navigating to a context message', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [
          {
            id: 'model-a:free',
            name: 'Model A Free',
            context_length: 128000,
            supported_parameters: ['tools'],
          },
        ];
      },
      async runAgentTurn() {
        return {
          mode: 'tools',
          action: { type: 'speak_public', text: 'agent reply' },
          usage: { promptTokens: 10, completionTokens: 5 },
        };
      },
    };

    const runtime = createRuntime({ transport });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'navigate me',
      target: 'public',
    });

    const wrapper = mountChat(runtime);
    const triggers = wrapper.findAll('.message-time-trigger-active');
    await triggers[1]!.trigger('click'); // open agent message inspector

    // Switch to Request tab to see context messages
    const requestTab = Array.from(
      document.body.querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'Request');
    requestTab!.click();
    await wrapper.vm.$nextTick();

    // Click the first context message (the human message)
    const contextMessages = document.body.querySelectorAll('.inspector-line');
    expect(contextMessages.length).toBeGreaterThan(0);
    (contextMessages[0] as HTMLButtonElement).click();
    await wrapper.vm.$nextTick();

    // Back button should now be active
    const backBtn = document.body.querySelector(
      'button[aria-label="Back"]',
    ) as HTMLButtonElement | null;
    expect(backBtn!.disabled).toBe(false);
  });

  it('system message timestamp is inspectable (active trigger)', async () => {
    // createDefaultAgent adds "Alpha" — the runtime emits a participant_joined system message.
    // System message rows have class message-line-system.
    // Currently canInspectMessage returns false for system messages, so their timestamps
    // have message-time-trigger but NOT message-time-trigger-active (disabled).
    const runtime = createRuntime(); // default: creates Alpha agent
    const wrapper = mountChat(runtime);

    const systemLine = wrapper.find('.message-line-system');
    expect(systemLine.exists()).toBe(true);
    const trigger = systemLine.find('.message-time-trigger');
    expect(trigger.exists()).toBe(true);
    // This FAILS before the fix: the system message timestamp is not active
    expect(trigger.classes()).toContain('message-time-trigger-active');
  });

  it('closes the inspector', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'close me',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.message-time-trigger-active').trigger('click');
    expect(document.body.textContent).toContain('Agent');

    const closeBtn = document.body.querySelector(
      'button[aria-label="Close"]',
    ) as HTMLButtonElement | null;
    closeBtn!.click();
    await wrapper.vm.$nextTick();

    // Inspector card should be gone from DOM
    expect(document.body.querySelector('.inspection-card')).toBeNull();
  });
});
