import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { vi } from 'vitest';
import MultiAgentChat from '../../../../src/vue/components/MultiAgentChat.vue';
import { MultiChatRuntime } from '../../../../src/core/runtime';
import { initializeChatApp } from '../../../../src/vue/bootstrap';
import type {
  ChatMessage,
  OpenRouterTransport,
  TimelineMessageEntry,
} from '../../../../src/core';

export function createRuntime(options?: {
  transport?: OpenRouterTransport;
  createDefaultAgent?: boolean;
}) {
  const transport: OpenRouterTransport =
    options?.transport ??
    {
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

  runtime.updateSettings({ openRouterApiKey: 'key' });

  if (options?.createDefaultAgent !== false) {
    runtime.createAgent({
      name: 'Alpha',
      modelId: 'model-a:free',
      pricing: {
        prompt: '0.001',
        completion: '0.01',
      },
      systemPrompt: 'prompt',
      contextWindowSize: null,
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });
  }

  return runtime;
}

export function timelineMessages(runtime: MultiChatRuntime): ChatMessage[] {
  return runtime
    .getTimelineEntries()
    .filter((entry): entry is TimelineMessageEntry => entry.kind === 'message')
    .map((entry) => entry.message);
}

export function mountChat(runtime: MultiChatRuntime) {
  const pinia = createPinia();
  initializeChatApp(pinia, runtime);
  return mount(MultiAgentChat, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
    },
  });
}
