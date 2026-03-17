import type { AgentConfig, ChatMessage, CostDisplayMode } from '../../core';

export function formatMessageCost(costUsd: number): string {
  const minimumFractionDigits = costUsd > 0 && costUsd < 0.0001 ? 6 : 4;

  return `$${costUsd.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  })}`;
}

export function formatContributorCost(costUsd: number): string {
  return formatMessageCost(costUsd);
}

export function requestMessageCost(message: ChatMessage): number {
  if (typeof message.requestCostUsd === 'number') {
    return message.requestCostUsd;
  }

  if (
    typeof message.ownPromptCostUsd !== 'number' &&
    typeof message.downstreamPromptCostUsd !== 'number'
  ) {
    return message.costUsd ?? 0;
  }

  return 0;
}

export function ownPromptMessageCost(message: ChatMessage): number {
  return message.ownPromptCostUsd ?? 0;
}

export function downstreamMessageCost(message: ChatMessage): number {
  return message.downstreamPromptCostUsd ?? 0;
}

export function displayedMessageCost(
  message: ChatMessage,
  mode: CostDisplayMode,
): number {
  if (mode === 'request') {
    return requestMessageCost(message);
  }

  return (
    requestMessageCost(message) -
    ownPromptMessageCost(message) +
    downstreamMessageCost(message)
  );
}

export function shouldShowMessageCost(
  message: ChatMessage,
  mode: CostDisplayMode,
): boolean {
  if (mode === 'off') {
    return false;
  }

  return displayedMessageCost(message, mode) > 0;
}

export function messageCostSummaryClass(
  message: ChatMessage,
  mode: CostDisplayMode,
): string {
  if (mode === 'request') {
    return 'message-cost-request';
  }

  return displayedMessageCost(message, mode) >= requestMessageCost(message)
    ? 'message-cost-total'
    : 'message-cost-net';
}

export function agentPromptPrice(agent: AgentConfig | null | undefined): number {
  const promptPrice = Number(agent?.pricing?.prompt);
  return Number.isFinite(promptPrice) && promptPrice > 0 ? promptPrice : 0;
}

export function agentCompletionPrice(
  agent: AgentConfig | null | undefined,
): number {
  const completionPrice = Number(agent?.pricing?.completion);
  return Number.isFinite(completionPrice) && completionPrice > 0
    ? completionPrice
    : 0;
}
