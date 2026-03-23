import { afterEach, describe, expect, it } from 'vitest';
import { createRuntime, mountChat } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat history controls', () => {
  it('shows a manual cutoff banner and mutes older messages after reset', async () => {
    const runtime = createRuntime();
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
      .find((button) => button.text().includes('Technical info: off'))!
      .trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text() === 'New topic')!
      .trigger('click');
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Fresh context',
      target: 'public',
      triggerSweep: false,
    });

    expect(wrapper.text()).toContain('New topic starts below.');
    expect(wrapper.text()).toContain('Delete messages above');
    expect(wrapper.findAll('.chat-line-muted')).toHaveLength(3);
    expect(wrapper.text()).toContain('Fresh context');

    const logText = wrapper
      .findAll('.chat-log > *')
      .map((node) => node.text())
      .join('\n');
    expect(logText.indexOf('Still old')).toBeLessThan(
      logText.indexOf('New topic starts below.'),
    );
    expect(logText.indexOf('stayed silent: noop')).toBeLessThan(
      logText.indexOf('New topic starts below.'),
    );
    expect(logText.indexOf('New topic starts below.')).toBeLessThan(
      logText.indexOf('Fresh context'),
    );
  });

  it('clears older messages when clicking the cutoff link', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Before cutoff',
      target: 'public',
    });

    const wrapper = mountChat(runtime);
    await wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text().includes('Technical info: off'))!
      .trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text() === 'New topic')!
      .trigger('click');
    await runtime.sendMessage({
      senderId: 'human',
      content: 'After cutoff',
      target: 'public',
      triggerSweep: false,
    });

    await wrapper.find('.cutoff-link').trigger('click');

    expect(wrapper.text()).not.toContain('New topic starts below.');
    expect(wrapper.text()).not.toContain('Before cutoff');
    expect(wrapper.text()).not.toContain('stayed silent: noop');
    expect(wrapper.text()).toContain('After cutoff');
    expect(wrapper.findAll('.chat-line-muted')).toHaveLength(0);
  });

  it('moves the manual cutoff when dragging it inside chat history', async () => {
    const runtime = createRuntime();
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
    await wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text() === 'New topic')!
      .trigger('click');
    await wrapper.vm.$nextTick();

    const chatLog = wrapper.find('.chat-log').element as HTMLElement;
    const firstMessage = wrapper
      .findAll('[data-timeline-entry-id]')
      .find((node) => node.text().includes('One'))!.element as HTMLElement;
    const secondMessage = wrapper
      .findAll('[data-timeline-entry-id]')
      .find((node) => node.text().includes('Two'))!.element as HTMLElement;
    const thirdMessage = wrapper
      .findAll('[data-timeline-entry-id]')
      .find((node) => node.text().includes('Three'))!.element as HTMLElement;

    setElementRect(chatLog, { top: 0, bottom: 400, left: 0, right: 400 });
    setElementRect(firstMessage, { top: 40, bottom: 80, left: 0, right: 400 });
    setElementRect(secondMessage, {
      top: 120,
      bottom: 160,
      left: 0,
      right: 400,
    });
    setElementRect(thirdMessage, {
      top: 200,
      bottom: 240,
      left: 0,
      right: 400,
    });

    await wrapper
      .find('.cutoff-drag-handle')
      .trigger('pointerdown', { button: 0, pointerId: 1 });
    window.dispatchEvent(createPointerLikeEvent('pointermove', 10, 140, 1));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-cutoff-drop-active="true"]').exists()).toBe(
      true,
    );
    window.dispatchEvent(createPointerLikeEvent('pointerup', 10, 140, 1));
    await wrapper.vm.$nextTick();

    const logText = wrapper
      .findAll('.chat-log > *')
      .map((node) => node.text())
      .join('\n');
    expect(logText.indexOf('One')).toBeLessThan(
      logText.indexOf('New topic starts below.'),
    );
    expect(logText.indexOf('New topic starts below.')).toBeLessThan(
      logText.indexOf('Two'),
    );
    expect(wrapper.findAll('.chat-line-muted')).toHaveLength(2);
  });

  it('removes the manual cutoff when dragging it outside chat history', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Before cutoff',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    await wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text() === 'New topic')!
      .trigger('click');
    await wrapper.vm.$nextTick();

    const chatLog = wrapper.find('.chat-log').element as HTMLElement;
    setElementRect(chatLog, { top: 0, bottom: 200, left: 0, right: 200 });

    await wrapper
      .find('.cutoff-drag-handle')
      .trigger('pointerdown', { button: 0, pointerId: 1 });
    window.dispatchEvent(createPointerLikeEvent('pointerup', 250, 250, 1));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('New topic starts below.');
    expect(wrapper.findAll('.chat-line-muted')).toHaveLength(0);
  });

  it('renders only the latest manual cutoff banner after repeated resets', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Before first reset',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);
    const resetButton = wrapper
      .findAll('.toolbar-button')
      .find((button) => button.text() === 'New topic')!;

    await resetButton.trigger('click');
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Between resets',
      target: 'public',
      triggerSweep: false,
    });

    await resetButton.trigger('click');
    await runtime.sendMessage({
      senderId: 'human',
      content: 'After second reset',
      target: 'public',
      triggerSweep: false,
    });

    expect(wrapper.findAll('.cutoff-banner-manual')).toHaveLength(1);
    expect(wrapper.findAll('.cutoff-link')).toHaveLength(2);
  });
});

function setElementRect(
  element: HTMLElement,
  rect: { top: number; bottom: number; left: number; right: number },
): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...rect,
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      toJSON: () => rect,
    }),
  });
}

function createPointerLikeEvent(
  type: string,
  clientX: number,
  clientY: number,
  pointerId: number,
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', {
    configurable: true,
    value: pointerId,
  });
  return event;
}
