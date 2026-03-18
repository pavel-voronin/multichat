import { afterEach, describe, expect, it } from 'vitest';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat agent lifecycle', () => {
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
  });
});
