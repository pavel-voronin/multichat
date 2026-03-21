import { vi } from 'vitest';
import { MultiChatRuntime } from '../../../src/core/runtime';
import type {
  AgentTurnResult,
  ChatMessage,
  OpenRouterTransport,
  RuntimeConfig,
  RuntimeEvent,
  TimelineMessageEntry,
  TimelineTechnicalEventEntry,
} from '../../../src/core';

export function createTransport(
  handler: (
    agentId: string,
    mode: 'tools' | 'json',
  ) => Promise<AgentTurnResult>,
): OpenRouterTransport {
  return {
    async listModels() {
      return [];
    },
    async runAgentTurn(input) {
      return handler(input.context.agent.id, input.mode);
    },
  };
}

export function createRuntime(config?: Partial<RuntimeConfig>) {
  return new MultiChatRuntime({
    transport: createTransport(async () => ({
      mode: 'tools',
      action: { type: 'stay_silent', reason: 'noop' },
    })),
    storage: {
      load: () => null,
      save: vi.fn(),
      reset: vi.fn(),
    },
    now: () => new Date('2026-03-16T10:00:00.000Z'),
    idGenerator: (() => {
      let counter = 0;
      return () => `id-${++counter}`;
    })(),
    ...config,
  });
}

export function timelineMessages(runtime: MultiChatRuntime): ChatMessage[] {
  return runtime
    .getTimelineEntries()
    .filter((entry): entry is TimelineMessageEntry => entry.kind === 'message')
    .filter((entry) => entry.message.kind !== 'system')
    .map((entry) => entry.message);
}

export function timelineEvents(runtime: MultiChatRuntime): RuntimeEvent[] {
  return runtime
    .getTimelineEntries()
    .filter(
      (entry): entry is TimelineTechnicalEventEntry =>
        entry.kind === 'technical-event',
    )
    .map((entry) => entry.event);
}
