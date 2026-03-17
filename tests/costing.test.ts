import { describe, expect, it } from 'vitest';
import type { AgentConfig, ChatMessage } from '../src/core';
import {
  agentCompletionPrice,
  agentPromptPrice,
  displayedMessageCost,
  formatMessageCost,
  messageCostSummaryClass,
  requestMessageCost,
  shouldShowMessageCost,
} from '../src/vue/utils/costing';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    senderId: 'human',
    target: 'public',
    content: 'hello',
    createdAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
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

  it('extracts valid positive pricing from agent config', () => {
    const agent: AgentConfig = {
      id: 'a-1',
      name: 'Alpha',
      modelId: 'model-a',
      systemPrompt: 'prompt',
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
      pricing: { prompt: '0.002', completion: '0.01' },
    };
    expect(agentPromptPrice(agent)).toBe(0.002);
    expect(agentCompletionPrice(agent)).toBe(0.01);
  });
});
