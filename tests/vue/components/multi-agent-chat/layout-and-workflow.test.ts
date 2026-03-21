import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiChatRuntime } from '../../../../src/core/runtime';
import type { OpenRouterTransport } from '../../../../src/core';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat layout and workflow', () => {
  it('switches from blocked agent wizard to settings instead of stacking modals', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [{ id: 'model-a:free', name: 'Model A Free' }];
      },
      async runAgentTurn() {
        return {
          mode: 'tools',
          action: { type: 'stay_silent', reason: 'noop' },
        };
      },
    };

    const runtime = new MultiChatRuntime({
      transport,
      storage: {
        load: () => null,
        save: vi.fn(),
        reset: vi.fn(),
      },
    });

    const wrapper = mountChat(runtime);

    await wrapper.get('.participants-add-button').trigger('click');
    expect(document.body.textContent).toContain('Create agent');

    const openSettingsButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((button) => button.textContent?.trim() === 'Open settings') as
      | HTMLButtonElement
      | undefined;
    expect(openSettingsButton).toBeDefined();

    openSettingsButton?.click();
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('.wizard-backdrop')).toBeNull();
    expect(document.body.querySelector('.modal-backdrop')).not.toBeNull();

    const closeButton = Array.from(
      document.body.querySelectorAll('.modal-backdrop button'),
    ).find((button) => button.textContent?.trim() === 'Close') as
      | HTMLButtonElement
      | undefined;
    expect(closeButton).toBeDefined();

    closeButton?.click();
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('.modal-backdrop')).toBeNull();
    expect(document.body.querySelector('.wizard-backdrop')).not.toBeNull();

    wrapper.unmount();
  });

  it('renders stop button next to send', () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    expect(
      wrapper
        .findAll('.toolbar-button')
        .map((button) => button.text())
        .filter((text) => text === 'Reset agents' || text === 'Stop'),
    ).toEqual(['Stop']);
    expect(wrapper.find('.composer-actions').text()).toContain('Send');
  });

  it('shows Human as the default participant name', () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    expect(wrapper.text()).toContain('Human');
  });

  it('renders message metadata with real spaces in text content', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello world',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    const line = wrapper.get('.message-line');
    const normalizedText = line.element.textContent
      ?.replace(/\s+/g, ' ')
      .trim();
    expect(normalizedText).toMatch(
      /^\[\d{2}:\d{2}:\d{2}\] <Human> hello world$/,
    );
  });

  it('scrolls chat history to the bottom on initial mount when messages already exist', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'First',
      target: 'public',
      triggerSweep: false,
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Second',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    const chatLog = wrapper.get('.chat-log').element as HTMLDivElement;
    Object.defineProperties(chatLog, {
      clientHeight: {
        configurable: true,
        value: 100,
      },
      scrollHeight: {
        configurable: true,
        value: 480,
      },
    });

    await wrapper.vm.$nextTick();

    expect(chatLog.scrollTop).toBe(480);
  });
});
