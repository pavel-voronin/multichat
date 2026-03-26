import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiChatRuntime } from '../../../../src/core/runtime';
import type { OpenRouterTransport } from '../../../../src/core';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

function createDragEvent(
  type: string,
  dataTransfer: DataTransfer | object,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: dataTransfer,
  });
  return event;
}

describe('MultiAgentChat layout and workflow', () => {
  it('shows welcome modal for a fresh workspace on initial mount', () => {
    const runtime = new MultiChatRuntime({
      transport: {
        async listModels() {
          return [];
        },
        async runAgentTurn() {
          return { mode: 'tools', action: { type: 'stay_silent', reason: 'noop' } };
        },
      },
      storage: {
        load: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      },
    });

    const wrapper = mountChat(runtime, { isFreshWorkspace: true });

    expect(document.body.textContent).toContain('Welcome to Multichat');
    wrapper.unmount();
  });

  it('does not show welcome modal when workspace was restored from persistence', () => {
    const runtime = new MultiChatRuntime({
      initialState: {
        tabs: [
          {
            id: 'tab-default',
            title: '#default',
            participants: [{ id: 'human', name: 'Human', role: 'human' }],
            agents: [],
            timeline: [],
            metrics: {},
            execution: {
              isSweepRunning: false,
              queuedSweep: false,
              sweepCount: 0,
              stopRequested: false,
            },
            maxAutoRounds: 12,
            requestTraces: {},
            entryInspectionIndex: {},
            turnOrdering: { strategy: 'round_robin' },
          },
        ],
        activeTabId: 'tab-default',
        settings: {
          openRouterApiKey: 'key',
        },
      },
      transport: {
        async listModels() {
          return [];
        },
        async runAgentTurn() {
          return { mode: 'tools', action: { type: 'stay_silent', reason: 'noop' } };
        },
      },
      storage: {
        load: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      },
    });

    const wrapper = mountChat(runtime);

    expect(document.body.textContent).not.toContain('Welcome to Multichat');
    wrapper.unmount();
  });

  it('switches from blocked agent wizard to settings instead of stacking modals', async () => {
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
          action: { type: 'stay_silent', reason: 'noop' },
        };
      },
    };

    const runtime = new MultiChatRuntime({
      transport,
      storage: {
        load: async () => null,
        save: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
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

    expect(document.body.querySelector('.ui-modal-backdrop')).not.toBeNull();
    expect(document.body.textContent).toContain('Settings');
    expect(document.body.textContent).not.toContain('Create agent');

    const closeButton = Array.from(
      document.body.querySelectorAll('.ui-modal-backdrop button'),
    ).find((button) => button.textContent?.trim() === 'Close') as
      | HTMLButtonElement
      | undefined;
    expect(closeButton).toBeDefined();

    closeButton?.click();
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('.ui-modal-backdrop')).not.toBeNull();
    expect(document.body.textContent).toContain('Create agent');

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
    wrapper.unmount();
  });

  it('opens chat settings from the toolbar', async () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    await wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text() === 'Chat settings')
      ?.trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Chat settings');
    expect(document.body.textContent).toContain('Max auto-rounds');
    wrapper.unmount();
  });

  it('shows Human as the default participant name', () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    expect(wrapper.text()).toContain('Human');
    wrapper.unmount();
  });

  it('invalidates the persisted models cache from settings', async () => {
    const runtime = createRuntime();
    runtime.setModelsCatalogSnapshot({
      models: [
        {
          id: 'openai/gpt-4.1',
          name: 'GPT-4.1',
          context_length: 128000,
          supported_parameters: ['tools'],
        },
      ],
      lastFetchedAt: Date.now(),
    });
    const wrapper = mountChat(runtime);

    const settingsButton = wrapper.find('.settings-button');
    expect(settingsButton.exists()).toBe(true);

    await settingsButton.trigger('click');
    expect(document.body.textContent).toContain('Snapshot: 1 models');
    expect(document.body.textContent).not.toContain('Turn ordering');

    const invalidateButton = Array.from(
      document.body.querySelectorAll('.ui-modal-backdrop button'),
    ).find(
      (button) => button.textContent?.trim() === 'Invalidate models cache',
    ) as HTMLButtonElement | undefined;
    expect(invalidateButton).toBeDefined();

    invalidateButton?.click();
    await wrapper.vm.$nextTick();

    expect(runtime.getModelsCatalogSnapshot()).toBeNull();
    expect(document.body.textContent).toContain(
      'No persisted models snapshot.',
    );
    wrapper.unmount();
  });

  it('shows welcome modal after full reset', async () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    await wrapper.find('.settings-button').trigger('click');

    const resetButton = Array.from(
      document.body.querySelectorAll('.ui-modal-backdrop button'),
    ).find((button) => button.textContent?.trim() === 'Full reset') as
      | HTMLButtonElement
      | undefined;
    expect(resetButton).toBeDefined();

    resetButton?.click();
    await wrapper.vm.$nextTick();

    const modalBackdrop = document.body.querySelector('.ui-modal-backdrop');
    expect(modalBackdrop?.textContent).toContain('Welcome to Multichat');
    expect(modalBackdrop?.textContent).toContain('OpenRouter API key');
    wrapper.unmount();
  });

  it('saves per-chat settings from chat settings', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      systemPrompt: 'prompt',
    });
    const beta = runtime.createAgent({
      name: 'Beta',
      modelId: 'model-a:free',
      systemPrompt: 'prompt',
    });
    const wrapper = mountChat(runtime);

    const chatSettingsButton = wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text() === 'Chat settings');
    expect(chatSettingsButton).toBeDefined();
    await chatSettingsButton?.trigger('click');

    expect(document.body.textContent).toContain(
      'Limits how many automatic agent rounds can run after one triggering event.',
    );

    const autoRoundsInput = document.body.querySelector(
      '.ui-modal-backdrop .chat-settings-input',
    ) as HTMLInputElement | null;
    expect(autoRoundsInput).toBeDefined();
    autoRoundsInput!.value = '5';
    autoRoundsInput!.dispatchEvent(new Event('input'));
    await wrapper.vm.$nextTick();

    const strategySelect = document.body.querySelector(
      '.ui-modal-backdrop .turn-ordering-select',
    ) as HTMLSelectElement | null;
    expect(strategySelect).toBeDefined();
    strategySelect!.value = 'manual_order';
    strategySelect!.dispatchEvent(new Event('change'));
    await wrapper.vm.$nextTick();

    const items = Array.from(
      document.body.querySelectorAll('.turn-ordering-manual-item'),
    ) as HTMLDivElement[];
    const dataTransfer = {
      setData() {},
      getData() {
        return beta.id;
      },
      setDragImage() {},
    };
    items[1]!.dispatchEvent(createDragEvent('dragstart', dataTransfer));
    items[0]!.dispatchEvent(createDragEvent('dragover', dataTransfer));
    items[1]!.dispatchEvent(createDragEvent('dragend', dataTransfer));
    await wrapper.vm.$nextTick();

    const saveButton = Array.from(
      document.body.querySelectorAll('.ui-modal-backdrop button'),
    ).find((button) => button.textContent?.trim() === 'Save') as
      | HTMLButtonElement
      | undefined;
    expect(saveButton).toBeDefined();
    saveButton?.click();
    await wrapper.vm.$nextTick();

    expect(runtime.getState().turnOrdering).toEqual({
      strategy: 'manual_order',
      order: [beta.id, runtime.getState().agents[0]!.id],
    });
    expect(runtime.getState().maxAutoRounds).toBe(5);
    wrapper.unmount();
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

    const line = wrapper.get('.chat-line:not(.chat-line-system)');
    const normalizedText = line.element.textContent
      ?.replace(/\s+/g, ' ')
      .trim();
    expect(normalizedText).toMatch(
      /^\[\d{2}:\d{2}:\d{2}\] <Human> hello world$/,
    );
    wrapper.unmount();
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
    wrapper.unmount();
  });
});
