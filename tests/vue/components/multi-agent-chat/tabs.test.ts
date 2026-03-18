import { afterEach, describe, expect, it } from 'vitest';
import { mountChat, createRuntime } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat tabs', () => {
  it('renders one default tab on boot and supports inline rename with generated fallback', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const wrapper = mountChat(runtime);

    expect(wrapper.findAll('.chat-tab')).toHaveLength(1);
    expect(wrapper.text()).toContain('#default');

    await wrapper.get('.chat-tab-title').trigger('dblclick');
    const input = wrapper.get('.chat-tab-input');
    await input.setValue('#renamed');
    await wrapper.get('.chat-tab-save').trigger('click');
    await wrapper.vm.$nextTick();

    expect(runtime.getWorkspaceState().tabs[0]?.title).toBe('#renamed');
    expect(wrapper.get('.chat-tab-title').text()).toBe('#renamed');

    runtime.createTab();
    await wrapper.vm.$nextTick();

    await wrapper.get('.chat-tab-title').trigger('dblclick');
    const revertedInput = wrapper.get('.chat-tab-input');
    await revertedInput.setValue('   ');
    await wrapper.get('.chat-tab-save').trigger('click');

    expect(runtime.getWorkspaceState().tabs[0]?.title).toBe('#default2');
  });

  it('switches tabs and keeps MessageInput isolated per tab', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const defaultTabId = runtime.getWorkspaceState().activeTabId;
    const secondTab = runtime.createTab({ title: '#second' });
    runtime.activateTab(defaultTabId);

    const wrapper = mountChat(runtime);
    const textarea = wrapper.get('textarea');
    await textarea.setValue('draft one');

    expect(runtime.getWorkspaceState().tabs[0]?.draftMessage).toBe('draft one');

    const secondTabButton = wrapper
      .findAll('.chat-tab')
      .find((tab) => tab.text().includes('#second'));
    expect(secondTabButton).toBeDefined();

    await secondTabButton!.trigger('click');
    await wrapper.vm.$nextTick();
    const secondTextarea = wrapper.get('textarea');

    expect(runtime.getWorkspaceState().activeTabId).toBe(secondTab.id);
    expect((secondTextarea.element as HTMLTextAreaElement).value).toBe('');

    await secondTextarea.setValue('draft two');
    expect(runtime.getWorkspaceState().tabs[1]?.draftMessage).toBe('draft two');

    const firstTabButton = wrapper
      .findAll('.chat-tab')
      .find((tab) => tab.text().includes('#default'));
    expect(firstTabButton).toBeDefined();

    await firstTabButton!.trigger('click');
    await wrapper.vm.$nextTick();
    const firstTextareaAgain = wrapper.get('textarea');

    expect((firstTextareaAgain.element as HTMLTextAreaElement).value).toBe(
      'draft one',
    );
  });

  it('reorders tabs with drag and drop and persists the new order', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    runtime.renameTab(runtime.getWorkspaceState().activeTabId, '#one');
    runtime.createTab({ title: '#two', activate: false });
    runtime.createTab({ title: '#three', activate: false });
    const draggedTabId = runtime.getWorkspaceState().tabs[2]!.id;

    const wrapper = mountChat(runtime);
    const tabs = wrapper.findAll('.chat-tab');
    const dataTransfer = {
      setData() {},
      getData() {
        return draggedTabId;
      },
      setDragImage() {},
    };

    await tabs[2]!.trigger('dragstart', { dataTransfer });
    await tabs[0]!.trigger('dragover');
    await tabs[2]!.trigger('dragend');

    expect(runtime.getWorkspaceState().tabs.map((tab) => tab.title)).toEqual([
      '#three',
      '#one',
      '#two',
    ]);
  });

  it('creates a new tab when double clicking empty rail space', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const wrapper = mountChat(runtime);

    await wrapper.get('.chat-tabs-empty-zone').trigger('click', {
      clientX: 320,
      clientY: 12,
    });
    await wrapper.get('.chat-tabs-empty-zone').trigger('click', {
      clientX: 320,
      clientY: 12,
    });

    expect(runtime.getWorkspaceState().tabs.map((tab) => tab.title)).toEqual([
      '#default',
      '#default2',
    ]);
  });

  it('keeps creating tabs on repeated double click in the same empty rail spot', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const wrapper = mountChat(runtime);
    const emptyZone = wrapper.get('.chat-tabs-empty-zone');

    await emptyZone.trigger('click', {
      clientX: 320,
      clientY: 12,
    });
    await emptyZone.trigger('click', {
      clientX: 320,
      clientY: 12,
    });
    await emptyZone.trigger('click', {
      clientX: 320,
      clientY: 12,
    });
    await emptyZone.trigger('click', {
      clientX: 320,
      clientY: 12,
    });

    expect(runtime.getWorkspaceState().tabs.map((tab) => tab.title)).toEqual([
      '#default',
      '#default2',
      '#default3',
    ]);
  });

  it('creates a new tab on single click of the plus button', async () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const wrapper = mountChat(runtime);

    await wrapper.get('.chat-tabs-add').trigger('click');
    await wrapper.vm.$nextTick();

    expect(runtime.getWorkspaceState().tabs.map((tab) => tab.title)).toEqual([
      '#default',
      '#default2',
    ]);
    expect(wrapper.get('.chat-tab-input').element).toBeInstanceOf(HTMLInputElement);
    expect((wrapper.get('.chat-tab-input').element as HTMLInputElement).value).toBe(
      '#default2',
    );
  });
});
