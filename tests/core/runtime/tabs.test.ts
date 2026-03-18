import { describe, expect, it } from 'vitest';
import { MultiChatRuntime } from '../../../src/core/runtime';
import { createTransport, timelineMessages } from './helpers';

function createEmptyRuntime() {
  return new MultiChatRuntime({
    transport: createTransport(async () => ({
      mode: 'tools',
      action: { type: 'stay_silent', reason: 'noop' },
    })),
    storage: {
      load: () => null,
      save: () => {},
      reset: () => {},
    },
    now: () => new Date('2026-03-16T10:00:00.000Z'),
    idGenerator: (() => {
      let counter = 0;
      return () => `id-${++counter}`;
    })(),
  });
}

describe('MultiChatRuntime tabs', () => {
  it('boots with one default tab and can manage tab lifecycle', () => {
    const runtime = createEmptyRuntime();

    expect(runtime.getWorkspaceState().tabs).toHaveLength(1);
    expect(runtime.getWorkspaceState().tabs[0]?.title).toBe('#default');

    const firstTabId = runtime.getWorkspaceState().activeTabId;
    const secondTab = runtime.createTab();
    const thirdTab = runtime.createTab({ activate: false });

    runtime.renameTab(secondTab.id, '#renamed');
    runtime.moveTab(thirdTab.id, 1);

    expect(runtime.getWorkspaceState().tabs.map((tab) => tab.title)).toEqual([
      '#default',
      '#default3',
      '#renamed',
    ]);

    runtime.closeTab(secondTab.id);
    expect(runtime.getWorkspaceState().tabs.map((tab) => tab.title)).toEqual([
      '#default',
      '#default3',
    ]);

    runtime.closeTab(firstTabId);
    runtime.closeTab(thirdTab.id);

    expect(runtime.getWorkspaceState().tabs).toHaveLength(1);
    expect(runtime.getWorkspaceState().tabs[0]?.title).toBe('#default');
  });

  it('records tab operations in the shared debug log', () => {
    const runtime = createEmptyRuntime();
    const firstTabId = runtime.getWorkspaceState().activeTabId;
    const secondTab = runtime.createTab({ title: '#second' });

    runtime.renameTab(secondTab.id, '#renamed');
    runtime.moveTab(secondTab.id, 0);
    runtime.activateTab(firstTabId);
    runtime.closeTab(secondTab.id);

    const kinds = runtime.getState().debugLogs.map((entry) => entry.kind);

    expect(kinds).toContain('tab-created');
    expect(kinds).toContain('tab-renamed');
    expect(kinds).toContain('tab-closed');
  });

  it('falls back to generated default name when renamed to empty', () => {
    const runtime = createEmptyRuntime();
    const secondTab = runtime.createTab();

    runtime.renameTab(secondTab.id, '   ');

    expect(runtime.getWorkspaceState().tabs[1]?.title).toBe('#default2');
  });

  it('isolates participants, history, and reset history per tab', async () => {
    const runtime = createEmptyRuntime();
    const defaultTabId = runtime.getWorkspaceState().activeTabId;

    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'message one',
      target: 'public',
      triggerSweep: false,
    });
    runtime.resetAgentHistoryContext();

    const secondTab = runtime.createTab({ title: '#second' });
    runtime.createAgent({
      name: 'Beta',
      modelId: 'model-b',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    await runtime.sendMessage({
      senderId: 'human',
      content: 'message two',
      target: 'public',
      triggerSweep: false,
    });

    expect(runtime.getState().participants.map((participant) => participant.name)).toEqual([
      'Human',
      'Beta',
    ]);
    expect(timelineMessages(runtime).map((message) => message.content)).toEqual([
      'message two',
    ]);

    runtime.activateTab(defaultTabId);

    expect(runtime.getState().participants.map((participant) => participant.name)).toEqual([
      'Human',
      'Alpha',
    ]);
    expect(timelineMessages(runtime).map((message) => message.content)).toEqual([
      'message one',
    ]);
    expect(
      runtime
        .getTimelineEntries()
        .some(
          (entry) =>
            entry.kind === 'history-cutoff' && entry.cutoff.source === 'manual',
        ),
    ).toBe(true);

    runtime.closeTab(secondTab.id);
    expect(runtime.getWorkspaceState().tabs.some((tab) => tab.id === secondTab.id)).toBe(false);
  });

  it('keeps inactive tabs running while another tab is active', async () => {
    const runtime = new MultiChatRuntime({
      transport: createTransport(
        async (agentId) =>
          await new Promise((resolve) => {
            setTimeout(() => {
              if (agentId === 'id-1') {
                resolve({
                  mode: 'tools' as const,
                  action: { type: 'speak_public' as const, text: 'background reply' },
                });
                return;
              }

              resolve({
                mode: 'tools' as const,
                action: { type: 'stay_silent' as const, reason: 'noop' },
              });
            }, 5);
          }),
      ),
      storage: {
        load: () => null,
        save: () => {},
        reset: () => {},
      },
      now: () => new Date('2026-03-16T10:00:00.000Z'),
      idGenerator: (() => {
        let counter = 0;
        return () => `id-${++counter}`;
      })(),
    });

    runtime.updateSettings({ openRouterApiKey: 'key' });
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
    const firstTabId = runtime.getWorkspaceState().activeTabId;
    runtime.createTab();
    const secondTabId = runtime.getWorkspaceState().tabs[1]!.id;
    runtime.activateTab(firstTabId);

    const sendPromise = runtime.sendMessage({
      senderId: 'human',
      content: 'hello first tab',
      target: 'public',
    });
    runtime.activateTab(secondTabId);
    await sendPromise;

    expect(
      runtime
        .getTimelineEntries(firstTabId)
        .filter((entry) => entry.kind === 'message')
        .map((entry) => (entry.kind === 'message' ? entry.message.content : '')),
    ).toContain('background reply');
  });
});
