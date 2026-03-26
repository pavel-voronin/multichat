import { mount } from '@vue/test-utils';
import { createPinia, type Pinia } from 'pinia';
import { afterEach, vi } from 'vitest';
import MultiAgentChat from '../../../../src/vue/components/app/MultiAgentChat.vue';
import { MultiChatRuntime } from '../../../../src/core/runtime';
import {
  disposeChatApp,
  initializeChatApp,
} from '../../../../src/vue/bootstrap';
import { usePreferencesStore } from '../../../../src/vue/stores/preferences';
import type {
  OpenRouterTransport,
  ParticipantMessageEntry,
} from '../../../../src/core';

// Track the last pinia and wrapper for cleanup
let lastPinia: Pinia | null = null;
let lastWrapper: ReturnType<typeof mount> | null = null;

afterEach(() => {
  if (lastWrapper) {
    lastWrapper.unmount();
    lastWrapper = null;
  }
  if (lastPinia) {
    disposeChatApp(lastPinia);
    lastPinia = null;
  }
  localStorage.clear();
});

export function createRuntime(options?: {
  transport?: OpenRouterTransport;
  createDefaultAgent?: boolean;
  setApiKey?: boolean;
}) {
  const transport: OpenRouterTransport = options?.transport ?? {
    async listModels() {
      return [
        {
          id: 'model-a:free',
          name: 'Model A Free',
          context_length: 128000,
          supported_parameters: ['tools'],
        },
      ];
    },
    async runAgentTurn() {
      return { mode: 'tools', action: { type: 'stay_silent', reason: 'noop' } };
    },
  };

  const runtime = new MultiChatRuntime({
    transport,
    storage: {
      load: async () => null,
      save: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    },
  });

  if (options?.createDefaultAgent !== false) {
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      pricing: {
        prompt: '0.001',
        completion: '0.01',
      },
      systemPrompt: 'prompt',
    });
  }

  if (options?.setApiKey !== false) {
    runtime.updateSettings({ openRouterApiKey: 'key' });
  }

  return runtime;
}

export function timelineMessages(
  runtime: MultiChatRuntime,
): ParticipantMessageEntry[] {
  return runtime
    .getTimelineEntries()
    .filter(
      (entry): entry is ParticipantMessageEntry =>
        entry.kind === 'participant-message',
    );
}

export function mountChat(
  runtime: MultiChatRuntime,
  options?: {
    configure?: (pinia: Pinia) => void;
    isFreshWorkspace?: boolean;
  },
) {
  const pinia = createPinia();
  lastPinia = pinia;
  initializeChatApp(pinia, runtime, {
    isFreshWorkspace: options?.isFreshWorkspace,
  });
  options?.configure?.(pinia);
  const wrapper = mount(MultiAgentChat, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
    },
  });
  lastWrapper = wrapper;
  return wrapper;
}

export function setTechnicalInfoVisible(pinia: Pinia): void {
  usePreferencesStore(pinia).showSilentDecisions = true;
}
