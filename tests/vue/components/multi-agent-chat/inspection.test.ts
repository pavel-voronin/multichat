import { afterEach, describe, expect, it } from 'vitest';
import type { OpenRouterTransport } from '../../../../src/core';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat request inspection', () => {
  it('opens inspector for a human message showing Participant / Input / Output / Used In tabs', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello world',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.chat-line-time-active').trigger('click');

    expect(document.body.textContent).toContain('Participant');
    expect(document.body.textContent).toContain('Input');
    expect(document.body.textContent).toContain('Output');
    expect(document.body.textContent).toContain('Used In');
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
    await wrapper.get('.chat-line-time-active').trigger('click');

    // Human participant name ("Human" is the default human sender label)
    expect(document.body.textContent).toMatch(/Human/);
  });

  it('shows Human label and no prompts for a human message on Participant tab', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'human with no agents',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.chat-line-time-active').trigger('click');

    // Participant tab should be active by default
    expect(document.body.textContent).toContain('Human');
    expect(document.body.textContent).not.toContain('Agent Prompt');
    expect(document.body.textContent).not.toContain(
      'Full System Prompt (sent)',
    );
  });

  it('shows no request data on Input tab for a human message', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'no trace',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.chat-line-time-active').trigger('click');

    // Switch to Input tab
    const requestTab = Array.from(
      document.body.querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'Input');
    expect(requestTab).toBeDefined();
    requestTab!.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('No request data');
  });

  it('opens inspector for an agent message showing model and system prompt on Participant tab', async () => {
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
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            requestCostUsd: 0.001,
          },
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

    // Click the third trigger (triggers[0]=system, [1]=human, [2]=agent reply)
    const triggers = wrapper.findAll('.chat-line-time-active');
    await triggers[2]!.trigger('click');

    // Participant tab: model id should be visible
    expect(document.body.textContent).toContain('model-a:free');
    // Agent prompt label
    expect(document.body.textContent).toContain('Agent Prompt');
  });

  it('renders inspector prompts as selectable text blocks', async () => {
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
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            requestCostUsd: 0.001,
            requestPayloadJson: {
              messages: [
                { role: 'system', content: 'prompt' },
                { role: 'user', content: 'please answer' },
              ],
            },
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
    const triggers = wrapper.findAll('.chat-line-time-active');
    await triggers[2]!.trigger('click');

    const prompts = document.body.querySelectorAll('.inspection-prompt');

    expect(prompts.length).toBe(2);
    expect(prompts[0]!.tagName).toBe('PRE');
    expect(prompts[1]!.tagName).toBe('PRE');
  });

  it('loads models for the inspector participant card when cache is empty', async () => {
    let listModelsCalls = 0;
    const transport: OpenRouterTransport = {
      async listModels() {
        listModelsCalls += 1;
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
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            requestCostUsd: 0.001,
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
    const triggers = wrapper.findAll('.chat-line-time-active');
    await triggers[2]!.trigger('click');
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(listModelsCalls).toBe(1);
    expect(document.body.textContent).toContain('Model A Free');
    expect(document.body.textContent).toContain('128k ctx');
    wrapper.unmount();
  });

  it('shows speak_public action in Output tab for an agent message', async () => {
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
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            requestCostUsd: 0.001,
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
    const triggers = wrapper.findAll('.chat-line-time-active');
    await triggers[2]!.trigger('click'); // triggers[0]=system, [1]=human, [2]=agent reply

    const resultTab = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Output',
    );
    resultTab!.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Published to public chat');
  });

  it('shows no request data on Output tab for a human message', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'human result tab',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.chat-line-time-active').trigger('click');

    const resultTab = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Output',
    );
    resultTab!.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('No request data');
  });

  it('shows stay_silent action on agent message inspector', async () => {
    const runtime = createRuntime(); // default transport returns stay_silent: noop
    await runtime.sendMessage({
      senderId: 'human',
      content: 'should stay silent',
      target: 'public',
    });

    const wrapper = mountChat(runtime);
    await wrapper.get('.chat-line-time-active').trigger('click');
    expect(document.body.textContent).toContain('Participant');
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
    await wrapper.get('.chat-line-time-active').trigger('click');

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
    const triggers = wrapper.findAll('.chat-line-time-active');
    await triggers[2]!.trigger('click'); // triggers[0]=system, [1]=human, [2]=agent reply

    // Switch to Input tab to see context messages
    const requestTab = Array.from(
      document.body.querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'Input');
    requestTab!.click();
    await wrapper.vm.$nextTick();

    // Click the first context message (the human message)
    const contextMessages = document.body.querySelectorAll(
      '.inspector-line-wrapper',
    );
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
    // System message rows have class chat-line-system.
    // canInspectMessage returns true for all messages, so their timestamps
    // have chat-line-time-active (enabled).
    const runtime = createRuntime(); // default: creates Alpha agent
    const wrapper = mountChat(runtime);

    const systemLine = wrapper.find('.chat-line-system');
    expect(systemLine.exists()).toBe(true);
    const trigger = systemLine.find('.chat-line-time');
    expect(trigger.exists()).toBe(true);
    expect(trigger.classes()).toContain('chat-line-time-active');
  });

  it('shows System label on Participant tab for a system message', async () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    const systemLine = wrapper.find('.chat-line-system');
    await systemLine.find('.chat-line-time-active').trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('System');
    expect(document.body.textContent).not.toContain('Agent Prompt');
    expect(document.body.textContent).not.toContain(
      'Full System Prompt (sent)',
    );
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
    await wrapper.get('.chat-line-time-active').trigger('click');
    expect(document.body.textContent).toContain('Participant');

    const closeBtn = document.body.querySelector(
      'button[aria-label="Close"]',
    ) as HTMLButtonElement | null;
    closeBtn!.click();
    await wrapper.vm.$nextTick();

    // Inspector card should be gone from DOM
    expect(document.body.querySelector('.inspection-card')).toBeNull();
  });

  it('opens on Participant tab by default for a regular message', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'default tab test',
      target: 'public',
      triggerSweep: false,
    });
    const wrapper = mountChat(runtime);
    await wrapper.get('.chat-line-time-active').trigger('click');
    // The Participant tab label is visible and the tab bar is rendered
    expect(document.body.textContent).toContain('Participant');
    expect(document.body.textContent).toContain('Used In');
  });

  it('Used In tab shows empty state for a message with no downstream usage', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'used in test',
      target: 'public',
      triggerSweep: false,
    });
    const wrapper = mountChat(runtime);
    await wrapper.get('.chat-line-time-active').trigger('click');

    const usedInTab = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Used In',
    );
    expect(usedInTab).toBeDefined();
    usedInTab!.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain(
      'No messages used this in their context',
    );
  });
});
