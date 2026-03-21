import { mount } from '@vue/test-utils';
import { createPinia, type Pinia } from 'pinia';
import { vi } from 'vitest';
import MultiAgentChat from '../../../../src/vue/components/MultiAgentChat.vue';
import { MultiChatRuntime } from '../../../../src/core/runtime';
import { initializeChatApp } from '../../../../src/vue/bootstrap';
import { usePreferencesStore } from '../../../../src/vue/stores/preferences';
import type {
  ChatMessage,
  OpenRouterTransport,
  TimelineMessageEntry,
} from '../../../../src/core';

export function createRuntime(options?: {
  transport?: OpenRouterTransport;
  createDefaultAgent?: boolean;
  setApiKey?: boolean;
}) {
  const transport: OpenRouterTransport = options?.transport ?? {
    async listModels() {
      return [{ id: 'model-a:free', name: 'Model A Free' }];
    },
    async runAgentTurn() {
      return { mode: 'tools', action: { type: 'stay_silent', reason: 'noop' } };
    },
  };

  const runtime = new MultiChatRuntime({
    transport,
    storage: {
      load: () => null,
      save: vi.fn(),
      reset: vi.fn(),
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
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
  }

  if (options?.setApiKey !== false) {
    runtime.updateSettings({ openRouterApiKey: 'key' });
  }

  return runtime;
}

export function timelineMessages(runtime: MultiChatRuntime): ChatMessage[] {
  return runtime
    .getTimelineEntries()
    .filter((entry): entry is TimelineMessageEntry => entry.kind === 'message')
    .filter((entry) => entry.message.kind !== 'system')
    .map((entry) => entry.message);
}

export function mountChat(
  runtime: MultiChatRuntime,
  options?: {
    configure?: (pinia: Pinia) => void;
  },
) {
  const pinia = createPinia();
  initializeChatApp(pinia, runtime);
  options?.configure?.(pinia);
  return mount(MultiAgentChat, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
    },
  });
}

export function setTechnicalInfoVisible(pinia: Pinia): void {
  usePreferencesStore(pinia).showSilentDecisions = true;
}

export function setContextPreviewVisible(pinia: Pinia): void {
  usePreferencesStore(pinia).showContextCutoffs = true;
}
