import { afterEach, describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { createRuntime, mountChat } from './helpers';
import { useSessionStore } from '../../../../src/vue/stores/session';
import { useMessageInputStore } from '../../../../src/vue/stores/messageInput';
import { useUiStore } from '../../../../src/vue/stores/ui';
import { useRuntimeStore } from '../../../../src/vue/stores/runtime';
import { initializeChatApp, disposeChatApp } from '../../../../src/vue/bootstrap';
import type { WelcomeChatPreset } from '../../../../src/vue/components/welcome/presets';

afterEach(() => {
  document.body.innerHTML = '';
});

const testPreset: WelcomeChatPreset = {
  version: 1,
  id: 'test-preset',
  title: 'Test Chat',
  initialMessage: 'Hello agents!',
  agents: [
    { name: 'Agent One', systemPrompt: 'You are agent one.' },
    { name: 'Agent Two', systemPrompt: 'You are agent two.' },
  ],
};

describe('session.launchPreset', () => {
  it('renames the active tab to the preset title', () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const pinia = createPinia();
    initializeChatApp(pinia, runtime, { isFreshWorkspace: true });

    const session = useSessionStore(pinia);
    session.launchPreset(testPreset, 'openai/gpt-4o');

    const workspace = useRuntimeStore(pinia).workspace;
    const activeTab = workspace.tabs.find((t) => t.id === workspace.activeTabId);
    expect(activeTab?.title).toBe('Test Chat');

    disposeChatApp(pinia);
  });

  it('creates agents from the preset with the chosen model', () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const pinia = createPinia();
    initializeChatApp(pinia, runtime, { isFreshWorkspace: true });

    const session = useSessionStore(pinia);
    session.launchPreset(testPreset, 'openai/gpt-4o');

    const workspace = useRuntimeStore(pinia).workspace;
    const activeTab = workspace.tabs.find((t) => t.id === workspace.activeTabId);
    expect(activeTab?.agents).toHaveLength(2);
    expect(activeTab?.agents[0]).toMatchObject({ name: 'Agent One', modelId: 'openai/gpt-4o', systemPrompt: 'You are agent one.' });
    expect(activeTab?.agents[1]).toMatchObject({ name: 'Agent Two', modelId: 'openai/gpt-4o', systemPrompt: 'You are agent two.' });

    disposeChatApp(pinia);
  });

  it('sets the initial message as draft for the active tab', () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const pinia = createPinia();
    initializeChatApp(pinia, runtime, { isFreshWorkspace: true });

    const session = useSessionStore(pinia);
    session.launchPreset(testPreset, 'openai/gpt-4o');

    const workspace = useRuntimeStore(pinia).workspace;
    const tabId = workspace.activeTabId;
    const messageInput = useMessageInputStore(pinia);
    expect(messageInput.draftByTabId[tabId]).toBe('Hello agents!');

    disposeChatApp(pinia);
  });

  it('closes the welcome modal after launching', () => {
    const runtime = createRuntime({ createDefaultAgent: false });
    const pinia = createPinia();
    initializeChatApp(pinia, runtime, { isFreshWorkspace: true });

    const ui = useUiStore(pinia);
    expect(ui.showWelcomeModal).toBe(true);

    const session = useSessionStore(pinia);
    session.launchPreset(testPreset, 'openai/gpt-4o');

    expect(ui.showWelcomeModal).toBe(false);

    disposeChatApp(pinia);
  });
});

describe('WelcomeDialog UI', () => {
  it('shows the API key input and Connect button on a fresh workspace', () => {
    const runtime = createRuntime({ createDefaultAgent: false, setApiKey: false });
    mountChat(runtime, { isFreshWorkspace: true });

    expect(document.body.textContent).toContain('Welcome to Multichat');
    expect(document.body.querySelector('input[type="password"]')).toBeTruthy();
    expect(document.body.textContent).toContain('Connect');
  });

  it('shows preset cards and Start exploring card', () => {
    const runtime = createRuntime({ createDefaultAgent: false, setApiKey: false });
    mountChat(runtime, { isFreshWorkspace: true });

    expect(document.body.textContent).toContain('Fantasy world');
    expect(document.body.textContent).toContain('Product team');
    expect(document.body.textContent).toContain('Start exploring');
  });

  it('closes the dialog when Start exploring is clicked', async () => {
    const runtime = createRuntime({ createDefaultAgent: false, setApiKey: false });
    mountChat(runtime, { isFreshWorkspace: true });

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const exploreButton = buttons.find((b) => b.textContent?.includes('Start exploring'));
    expect(exploreButton).toBeTruthy();
    exploreButton!.click();

    await new Promise((r) => setTimeout(r, 0));

    expect(document.body.textContent).not.toContain('Welcome to Multichat');
  });
});
