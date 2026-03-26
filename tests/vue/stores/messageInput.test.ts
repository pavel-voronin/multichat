import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { MultiChatRuntime } from '../../../src/core/runtime';
import { initializeChatApp } from '../../../src/vue/bootstrap';
import { useMessageInputStore } from '../../../src/vue/stores/messageInput';

function setup() {
  const pinia = createPinia();
  const runtime = new MultiChatRuntime({
    transport: {
      async listModels() { return []; },
      async runAgentTurn() {
        return { mode: 'tools', action: { type: 'stay_silent', reason: 'noop' } };
      },
    },
    storage: {
      load: async () => null,
      save: async () => {},
      reset: async () => {},
    },
  });
  initializeChatApp(pinia, runtime);
  return { pinia, runtime, messageInput: useMessageInputStore(pinia) };
}

describe('useMessageInputStore', () => {
  it('setDraftForTab sets a draft for an arbitrary tab without changing the active tab draft', () => {
    const { messageInput } = setup();

    messageInput.setDraftForTab('tab-xyz', 'hello world');

    expect(messageInput.draftByTabId['tab-xyz']).toBe('hello world');
  });

  it('setDraftForTab does not overwrite drafts for other tabs', () => {
    const { messageInput } = setup();

    messageInput.setDraftForTab('tab-a', 'message a');
    messageInput.setDraftForTab('tab-b', 'message b');

    expect(messageInput.draftByTabId['tab-a']).toBe('message a');
    expect(messageInput.draftByTabId['tab-b']).toBe('message b');
  });
});
