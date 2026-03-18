import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import MultiAgentChat from '../src/vue/components/MultiAgentChat.vue';
import { MultiChatRuntime } from '../src/core/runtime';
import { initializeChatApp } from '../src/vue/bootstrap';
import type {
  ChatMessage,
  OpenRouterTransport,
  TimelineMessageEntry,
} from '../src/core';

function createRuntime() {
  const transport: OpenRouterTransport = {
    async listModels() {
      return [{ id: 'model-a:free', name: 'Model A Free' }];
    },
    async runAgentTurn() {
      return { mode: 'tools', action: { type: 'stay_silent', reason: 'noop' } };
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

  runtime.updateSettings({ openRouterApiKey: 'key' });
  runtime.createAgent({
    name: 'Alpha',
    modelId: 'model-a:free',
    pricing: {
      prompt: '0.001',
      completion: '0.01',
    },
    systemPrompt: 'prompt',
    contextWindowSize: null,
    capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
  });

  return runtime;
}

function timelineMessages(runtime: MultiChatRuntime): ChatMessage[] {
  return runtime
    .getTimelineEntries()
    .filter((entry): entry is TimelineMessageEntry => entry.kind === 'message')
    .map((entry) => entry.message);
}

function mountChat(runtime: MultiChatRuntime) {
  const pinia = createPinia();
  initializeChatApp(pinia, runtime);
  return mount(MultiAgentChat, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
    },
  });
}

describe('MultiAgentChat', () => {
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
      document.body.querySelectorAll('button'),
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

  it('sends public message on enter', async () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    const textarea = wrapper.get('textarea');
    await textarea.setValue('Hello world');
    await textarea.trigger('keydown', { key: 'Enter' });

    expect(timelineMessages(runtime)[0]?.content).toBe('Hello world');
    expect(timelineMessages(runtime)[0]?.target).toBe('public');
  });

  it('double click participant inserts a mention prefix', async () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    await wrapper.findAll('.participant-row')[1].trigger('dblclick');

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      'Alpha: ',
    );
  });

  it('double click appends participant names into the mention prefix without duplicates', async () => {
    const runtime = createRuntime();
    runtime.createAgent({
      name: 'Beta',
      modelId: 'model-b:free',
      systemPrompt: 'prompt',
      contextWindowSize: null,
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });

    const wrapper = mountChat(runtime);

    const textarea = wrapper.get('textarea');
    await textarea.setValue('Alpha: hello');
    await wrapper.findAll('.participant-row')[2].trigger('dblclick');
    await wrapper.findAll('.participant-row')[1].trigger('dblclick');

    expect((textarea.element as HTMLTextAreaElement).value).toBe(
      'Alpha, Beta: hello',
    );
  });

  it('inserts participant mention when double clicking message sender', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Ping Alpha please',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    const sender = wrapper.get('.message-sender');
    expect(sender.text()).toBe('<Human>');

    await sender.trigger('dblclick');

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      'Human: ',
    );
  });

  it('renders stop button next to send', () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    expect(
      wrapper
        .findAll('.toolbar-button')
        .map((button) => button.text())
        .filter((text) => text === 'Reset agents' || text === 'Stop'),
    ).toEqual(['Reset agents', 'Stop']);
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

  it('opens request inspection for a human message from the timestamp', async () => {
    const runtime = createRuntime();
    runtime.createAgent({
      name: 'Beta',
      modelId: 'model-b:free',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
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

    wrapper.unmount();
  });

  it('opens the single downstream silent trace directly from a human message timestamp', async () => {
    const runtime = createRuntime();
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

    wrapper.unmount();
  });

  it('shows silent outcome details inside request inspection', async () => {
    const runtime = createRuntime();
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

    wrapper.unmount();
  });

  it('opens request inspection from a silent technical event timestamp', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ showSilentDecisions: true });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'stay silent please',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    await wrapper
      .get('.runtime-line .message-time-trigger-active')
      .trigger('click');

    expect(document.body.textContent).toContain('Request trace');
    expect(document.body.textContent).toContain('Alpha · tools');
    expect(document.body.textContent).toContain('stayed silent: noop');

    wrapper.unmount();
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
    const runtime = new MultiChatRuntime({
      transport,
      storage: {
        load: () => null,
        save: vi.fn(),
        reset: vi.fn(),
      },
    });
    runtime.updateSettings({ openRouterApiKey: 'key' });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
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

    await costTrigger.trigger('mouseleave');
    wrapper.unmount();
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

    wrapper.unmount();
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
    const runtime = new MultiChatRuntime({
      transport,
      storage: {
        load: () => null,
        save: vi.fn(),
        reset: vi.fn(),
      },
    });
    runtime.updateSettings({ openRouterApiKey: 'key' });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      pricing: {
        prompt: '0.001',
        completion: '0.01',
      },
      systemPrompt: 'prompt',
      contextWindowSize: null,
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
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

    await priceTrigger.trigger('mouseleave');
    wrapper.unmount();
  });

  it('shows a manual cutoff banner and mutes older messages after reset', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ showSilentDecisions: true });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Before cutoff',
      target: 'public',
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Still old',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    await wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text() === 'Reset agents')!
      .trigger('click');
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Fresh context',
      target: 'public',
      triggerSweep: false,
    });

    expect(wrapper.text()).toContain('History cleared for agents');
    expect(wrapper.text()).toContain('Clear chat history');
    expect(wrapper.findAll('.message-line-muted')).toHaveLength(2);
    expect(wrapper.text()).toContain('Fresh context');

    const logText = wrapper
      .findAll('.chat-log > *')
      .map((node) => node.text())
      .join('\n');
    expect(logText.indexOf('Still old')).toBeLessThan(
      logText.indexOf('History cleared for agents'),
    );
    expect(logText.indexOf('stayed silent: noop')).toBeLessThan(
      logText.indexOf('History cleared for agents'),
    );
    expect(logText.indexOf('History cleared for agents')).toBeLessThan(
      logText.indexOf('Fresh context'),
    );
  });

  it('clears older messages when clicking the cutoff link', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ showSilentDecisions: true });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Before cutoff',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    await wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text() === 'Reset agents')!
      .trigger('click');
    await runtime.sendMessage({
      senderId: 'human',
      content: 'After cutoff',
      target: 'public',
      triggerSweep: false,
    });

    await wrapper.find('.cutoff-link').trigger('click');

    expect(wrapper.text()).not.toContain('History cleared for agents');
    expect(wrapper.text()).not.toContain('Before cutoff');
    expect(wrapper.text()).not.toContain('stayed silent: noop');
    expect(wrapper.text()).toContain('After cutoff');
    expect(wrapper.findAll('.message-line-muted')).toHaveLength(0);
  });

  it('keeps context preview hidden by default', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'One',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    expect(wrapper.text()).not.toContain(
      'From here messages are included in context by current settings',
    );
    wrapper.unmount();
  });

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

    wrapper.unmount();
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

    expect(runtime.getState().settings.showSilentDecisions).toBe(true);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Technical info: on');
    expect(wrapper.text()).toContain('[silent Alpha] stayed silent: noop');

    wrapper.unmount();
  });

  it('shows cost for silent decisions after enabling technical info', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [{ id: 'model-a:free', name: 'Model A Free' }];
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

    const runtime = new MultiChatRuntime({
      transport,
      storage: {
        load: () => null,
        save: vi.fn(),
        reset: vi.fn(),
      },
    });

    runtime.updateSettings({ openRouterApiKey: 'key' });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      pricing: {
        prompt: '0.001',
        completion: '0.01',
      },
      systemPrompt: 'prompt',
      contextWindowSize: null,
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });

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

    wrapper.unmount();
  });

  it('shows runtime errors inside technical info', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [{ id: 'model-a:free', name: 'Model A Free' }];
      },
      async runAgentTurn() {
        throw new Error('upstream 502');
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

    runtime.updateSettings({ openRouterApiKey: 'key' });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      pricing: {
        prompt: '0.001',
        completion: '0.01',
      },
      systemPrompt: 'prompt',
      contextWindowSize: null,
      capabilities: { prefersTools: true, supportsToolUse: 'unsupported' },
    });

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

    wrapper.unmount();
  });

  it('keeps logs panel hidden by default while still collecting logs', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ openRouterApiKey: 'key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    expect(wrapper.text()).toContain('Logs: off');
    expect(wrapper.find('.logs-panel').exists()).toBe(false);
    expect(runtime.getState().debugLogs.length).toBeGreaterThan(0);

    wrapper.unmount();
  });

  it('opens the logs panel from the toolbar and renders detailed lines', async () => {
    const runtime = createRuntime();
    runtime.updateSettings({ openRouterApiKey: 'key' });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'hello',
      target: 'public',
    });

    const wrapper = mountChat(runtime);

    const logsButton = wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text().includes('Logs: off'));

    expect(logsButton).toBeDefined();
    await logsButton!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Logs: on');
    expect(wrapper.find('.logs-panel').exists()).toBe(true);
    expect(wrapper.find('.logs-panel-text').text()).toContain('turn-requested');
    expect(wrapper.find('.logs-panel-text').text()).toContain('turn-result');
    expect(wrapper.find('.logs-panel-text').text()).toContain(
      'message-created',
    );

    wrapper.unmount();
  });

  it('shows preview cutoff labels after enabling the setting', async () => {
    const runtime = createRuntime();
    runtime.createAgent({
      name: 'Beta',
      modelId: 'model-b:free',
      systemPrompt: 'prompt',
      contextWindowSize: 1,
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    runtime.updateSettings({ defaultContextWindowSize: 2 });

    await runtime.sendMessage({
      senderId: 'human',
      content: 'One',
      target: 'public',
      triggerSweep: false,
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Two',
      target: 'public',
      triggerSweep: false,
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Three',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    const contextBordersButton = wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text().includes('Show borders'));

    expect(contextBordersButton).toBeDefined();
    await contextBordersButton!.trigger('click');

    expect(runtime.getState().settings.showContextCutoffs).toBe(true);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('context for: Alpha');
    expect(wrapper.text()).toContain('context for: Beta');
    expect(wrapper.text()).not.toContain(
      'From here messages are included in context by current settings',
    );

    wrapper.unmount();
  });

  it('asks for confirmation before hiding an agent and keeps the name in chat', async () => {
    const runtime = createRuntime();
    const alpha = runtime.getState().agents[0]!;
    await runtime.sendMessage({
      senderId: alpha.id,
      content: 'I will stay in history',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    const deleteButton = wrapper.get('.participant-delete-button');
    await deleteButton.trigger('click');

    expect(document.body.textContent).toContain('Hide agent?');
    expect(document.body.textContent).toContain(
      'its name will remain in chat history',
    );
    expect(wrapper.text()).toContain('Alpha');

    const confirmButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((button) => button.textContent?.trim() === 'Hide and disable') as
      | HTMLButtonElement
      | undefined;
    expect(confirmButton).toBeDefined();

    confirmButton?.click();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('model-a:free');
    expect(wrapper.text()).toContain('I will stay in history');
    expect(wrapper.text()).toContain('<Alpha>');
    expect(
      runtime.getState().agents.find((agent) => agent.id === alpha.id),
    ).toEqual(
      expect.objectContaining({
        isEnabled: false,
        isHidden: true,
      }),
    );

    wrapper.unmount();
  });
});
