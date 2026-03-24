import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core';
import type { CostTrackedItem } from '../../../src/vue/types';
import {
  aggregateAgentSpendFromTraces,
  agentCompletionSpend,
  agentPromptSpend,
  displayedMessageCost,
  formatMessageCost,
  messageCostSummaryClass,
  requestMessageCost,
  shouldShowMessageCost,
} from '../../../src/vue/utils/costing';

function createMessage(
  overrides: Partial<CostTrackedItem> = {},
): CostTrackedItem {
  return { ...overrides };
}

function createEvent(
  overrides: Partial<CostTrackedItem> = {},
): CostTrackedItem {
  return { ...overrides };
}

describe('costing utils', () => {
  it('formats message cost with 4 decimals by default', () => {
    expect(formatMessageCost(1.2)).toBe('$1.2000');
  });

  it('uses request cost as primary value', () => {
    const message = createMessage({ requestCostUsd: 0.5, costUsd: 0.1 });
    expect(requestMessageCost(message)).toBe(0.5);
  });

  it('calculates net display mode', () => {
    const message = createMessage({
      requestCostUsd: 0.5,
      ownPromptCostUsd: 0.1,
      downstreamPromptCostUsd: 0.04,
    });
    expect(displayedMessageCost(message, 'net')).toBeCloseTo(0.44);
  });

  it('calculates net display mode for silent events by the same rules', () => {
    const event = createEvent({
      requestCostUsd: 0.5,
      ownPromptCostUsd: 0.1,
    });
    expect(displayedMessageCost(event, 'net')).toBeCloseTo(0.4);
  });

  it('hides costs when mode is off', () => {
    const message = createMessage({ requestCostUsd: 0.5 });
    expect(shouldShowMessageCost(message, 'off')).toBe(false);
  });

  it('returns summary class for net mode', () => {
    const message = createMessage({
      requestCostUsd: 0.5,
      ownPromptCostUsd: 0.1,
      downstreamPromptCostUsd: 0.04,
    });
    expect(messageCostSummaryClass(message, 'net')).toBe('message-cost-net');
  });

  it('calculates aggregate prompt and completion spend from metrics', () => {
    const agent: AgentConfig = {
      id: 'a-1',
      name: 'Alpha',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      pricing: { prompt: '0.002', completion: '0.01' },
    };
    expect(
      agentPromptSpend(agent, {
        requestCount: 1,
        promptTokens: 5,
        completionTokens: 3,
        totalTokens: 8,
        estimatedCost: 0.04,
      }),
    ).toBe(0.01);
    expect(
      agentCompletionSpend(agent, {
        requestCount: 1,
        promptTokens: 5,
        completionTokens: 3,
        totalTokens: 8,
        estimatedCost: 0.04,
      }),
    ).toBe(0.03);
  });

  it('aggregates agent spend from traces so total always matches breakdown', () => {
    const breakdown = aggregateAgentSpendFromTraces('a-1', [
      {
        id: 't-1',
        sweep: 1,
        agentId: 'a-1',
        agentName: 'Alpha',
        mode: 'tools',
        fallback: false,
        status: 'succeeded',
        startedAt: '2026-01-01T10:00:00.000Z',
        triggeringMessageIds: [],
        visibleMessageIds: [],
        nonSelfVisibleMessageIds: [],
        childTraceIds: [],
        upstreamMessageIds: [],
        downstreamMessageIds: [],
        payloads: {},
        links: [],
        usage: {
          promptTokens: 10,
          completionTokens: 2,
          estimatedCost: 0.0173,
          promptCostUsd: 0.0141,
          requestCostUsd: 0.0173,
        },
      },
    ]);

    expect(breakdown.promptCostUsd).toBeCloseTo(0.0141);
    expect(breakdown.completionCostUsd).toBeCloseTo(0.0032);
    expect(breakdown.totalCostUsd).toBeCloseTo(0.0173);
    expect(
      breakdown.promptCostUsd +
        breakdown.completionCostUsd -
        breakdown.totalCostUsd,
    ).toBeCloseTo(0);
  });
});
