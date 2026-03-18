import { afterEach, describe, expect, it } from 'vitest';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat logs panel', () => {
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
  });
});
