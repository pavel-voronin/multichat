import type { AgentConfig, AgentMetrics, RequestTrace } from '../../core';
import type { CostDisplayMode, CostTrackedItem } from '../types';

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

export function requestMessageCost(item: CostTrackedItem): number {
  if (typeof item.requestCostUsd === 'number') {
    return item.requestCostUsd;
  }

  if (
    typeof item.ownPromptCostUsd !== 'number' &&
    typeof item.downstreamPromptCostUsd !== 'number'
  ) {
    return item.costUsd ?? 0;
  }

  return 0;
}

export function ownPromptMessageCost(item: CostTrackedItem): number {
  return item.ownPromptCostUsd ?? 0;
}

export function downstreamMessageCost(item: CostTrackedItem): number {
  return item.downstreamPromptCostUsd ?? 0;
}

export function displayedMessageCost(
  item: CostTrackedItem,
  mode: CostDisplayMode,
): number {
  if (mode === 'request') {
    return requestMessageCost(item);
  }

  return (
    requestMessageCost(item) -
    ownPromptMessageCost(item) +
    downstreamMessageCost(item)
  );
}

export function shouldShowMessageCost(
  item: CostTrackedItem,
  mode: CostDisplayMode,
): boolean {
  if (mode === 'off') {
    return false;
  }

  return displayedMessageCost(item, mode) > 0;
}

export function messageCostSummaryClass(
  item: CostTrackedItem,
  mode: CostDisplayMode,
): string {
  if (mode === 'request') {
    return 'message-cost-request';
  }

  return displayedMessageCost(item, mode) >= requestMessageCost(item)
    ? 'message-cost-total'
    : 'message-cost-net';
}

export function agentPromptPrice(
  agent: AgentConfig | null | undefined,
): number {
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

export function agentPromptSpend(
  agent: AgentConfig | null | undefined,
  metrics: AgentMetrics | null | undefined,
): number {
  return (metrics?.promptTokens ?? 0) * agentPromptPrice(agent);
}

export function agentCompletionSpend(
  agent: AgentConfig | null | undefined,
  metrics: AgentMetrics | null | undefined,
): number {
  return (metrics?.completionTokens ?? 0) * agentCompletionPrice(agent);
}

export function aggregateAgentSpendFromTraces(
  agentId: string | null | undefined,
  traces: RequestTrace[],
): {
  promptCostUsd: number;
  completionCostUsd: number;
  totalCostUsd: number;
} {
  if (!agentId) {
    return {
      promptCostUsd: 0,
      completionCostUsd: 0,
      totalCostUsd: 0,
    };
  }

  return traces.reduce(
    (sum, trace) => {
      if (trace.agentId !== agentId || trace.status !== 'succeeded') {
        return sum;
      }

      const promptCostUsd = trace.usage?.promptCostUsd ?? 0;
      const totalCostUsd =
        trace.usage?.requestCostUsd ?? trace.usage?.estimatedCost ?? 0;
      const completionCostUsd = Math.max(0, totalCostUsd - promptCostUsd);

      sum.promptCostUsd += promptCostUsd;
      sum.completionCostUsd += completionCostUsd;
      sum.totalCostUsd += totalCostUsd;
      return sum;
    },
    {
      promptCostUsd: 0,
      completionCostUsd: 0,
      totalCostUsd: 0,
    },
  );
}
