import { afterEach, describe, expect, it } from 'vitest';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat history controls', () => {
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
  });
});
