import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createPinia } from 'pinia';
import { initializeChatApp, disposeChatApp } from '../../../../src/vue/bootstrap';
import { usePreferencesStore } from '../../../../src/vue/stores/preferences';
import { useUiStore } from '../../../../src/vue/stores/ui';
import { useMessageInputStore } from '../../../../src/vue/stores/messageInput';
import {
  saveUiState,
  UI_PERSISTENCE_VERSION,
} from '../../../../src/vue/uiPersistence';
import { MultiChatRuntime } from '../../../../src/core/runtime';
import type { OpenRouterTransport } from '../../../../src/core';

let lastPinia: ReturnType<typeof createPinia> | null = null;

afterEach(() => {
  if (lastPinia) {
    disposeChatApp(lastPinia);
    lastPinia = null;
  }
  localStorage.clear();
});

function createRuntime() {
  const transport: OpenRouterTransport = {
    async listModels() {
      return [{
        id: 'model-a:free',
        name: 'Model A Free',
        context_length: 128000,
        supported_parameters: ['tools'],
      }];
    },
    async runAgentTurn() {
      return { mode: 'tools', action: { type: 'stay_silent', reason: 'noop' } };
    },
  };
  return new MultiChatRuntime({
    transport,
    storage: {
      load: async () => null,
      save: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    },
  });
}

function mountStores(preloadLocalStorage?: Parameters<typeof saveUiState>[0]) {
  if (preloadLocalStorage) {
    saveUiState(preloadLocalStorage);
  }
  const pinia = createPinia();
  lastPinia = pinia;
  const runtime = createRuntime();
  initializeChatApp(pinia, runtime);
  return {
    preferences: usePreferencesStore(pinia),
    ui: useUiStore(pinia),
    messageInput: useMessageInputStore(pinia),
  };
}

describe('UI state persistence', () => {
  it('restores showSilentDecisions from localStorage', () => {
    const { preferences } = mountStores({
      version: UI_PERSISTENCE_VERSION,
      showSilentDecisions: true,
      costDisplayMode: 'request',
      showLogsPanel: false,
      draftByTabId: {},
    });
    expect(preferences.showSilentDecisions).toBe(true);
  });

  it('restores costDisplayMode from localStorage', () => {
    const { preferences } = mountStores({
      version: UI_PERSISTENCE_VERSION,
      showSilentDecisions: false,
      costDisplayMode: 'net',
      showLogsPanel: false,
      draftByTabId: {},
    });
    expect(preferences.costDisplayMode).toBe('net');
  });

  it('restores showLogsPanel from localStorage', () => {
    const { ui } = mountStores({
      version: UI_PERSISTENCE_VERSION,
      showSilentDecisions: false,
      costDisplayMode: 'request',
      showLogsPanel: true,
      draftByTabId: {},
    });
    expect(ui.showLogsPanel).toBe(true);
  });

  it('restores draftByTabId from localStorage', () => {
    const { messageInput } = mountStores({
      version: UI_PERSISTENCE_VERSION,
      showSilentDecisions: false,
      costDisplayMode: 'request',
      showLogsPanel: false,
      draftByTabId: { 'tab-default': 'my draft' },
    });
    expect(messageInput.draftByTabId).toEqual({ 'tab-default': 'my draft' });
  });

  it('uses defaults when localStorage is empty', () => {
    const { preferences, ui } = mountStores();
    expect(preferences.showSilentDecisions).toBe(false);
    expect(preferences.costDisplayMode).toBe('request');
    expect(ui.showLogsPanel).toBe(false);
  });

  it('writes to localStorage when preferences change', async () => {
    const { preferences } = mountStores();
    preferences.showSilentDecisions = true;

    // Allow Vue watcher to flush
    await nextTick();

    const { preferences: preferences2 } = mountStores();
    expect(preferences2.showSilentDecisions).toBe(true);
  });
});
