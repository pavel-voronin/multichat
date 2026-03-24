import { vi } from 'vitest';
import { MultiChatRuntime } from '../../../src/core/runtime';
import type {
  AgentTurnResult,
  OpenRouterTransport,
  ParticipantMessageEntry,
  RuntimeConfig,
  SilentDecisionEntry,
  SweepFinishedEntry,
  SweepStartedEntry,
  SweepStoppedEntry,
  RuntimeErrorEntry,
} from '../../../src/core';

export function createTransport(
  handler: (agentId: string) => Promise<AgentTurnResult>,
): OpenRouterTransport {
  return {
    async listModels() {
      return [];
    },
    async runAgentTurn(input) {
      return handler(input.context.agent.id);
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
      load: async () => null,
      save: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    },
    now: () => new Date('2026-03-16T10:00:00.000Z'),
    idGenerator: (() => {
      let counter = 0;
      return () => `id-${++counter}`;
    })(),
    ...config,
  });
}

export function timelineMessages(runtime: MultiChatRuntime): ParticipantMessageEntry[] {
  return runtime
    .getTimelineEntries()
    .filter(
      (entry): entry is ParticipantMessageEntry =>
        entry.kind === 'participant-message',
    );
}

type TechnicalEntry =
  | SilentDecisionEntry
  | SweepStartedEntry
  | SweepFinishedEntry
  | SweepStoppedEntry
  | RuntimeErrorEntry;

export function timelineEvents(runtime: MultiChatRuntime): TechnicalEntry[] {
  return runtime.getTimelineEntries().filter((entry): entry is TechnicalEntry =>
    entry.kind === 'silent-decision' ||
    entry.kind === 'sweep-started' ||
    entry.kind === 'sweep-finished' ||
    entry.kind === 'sweep-stopped' ||
    entry.kind === 'runtime-error',
  );
}
