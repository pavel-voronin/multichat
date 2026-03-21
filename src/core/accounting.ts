import type {
  AgentConfig,
  AgentContextMessage,
  ChatTabState,
  TransportUsage,
} from './types';
import { findMessageEntryById } from './diagnostics';
import { emptyMetrics } from './workspace';

export function getPromptCostUsd(
  agent: AgentConfig,
  usage?: TransportUsage,
): number {
  const promptTokens = usage?.promptTokens;
  if (!promptTokens) return 0;
  const promptPrice = Number(agent.pricing?.prompt);
  if (!Number.isFinite(promptPrice) || promptPrice <= 0) return 0;
  return promptTokens * promptPrice;
}

export function applyUsage(
  agentId: string,
  usage: TransportUsage | undefined,
  tab: ChatTabState,
): void {
  if (!usage) return;
  const metrics = tab.metrics[agentId] ?? emptyMetrics();
  metrics.requestCount += 1;
  metrics.promptTokens += usage.promptTokens ?? 0;
  metrics.completionTokens += usage.completionTokens ?? 0;
  metrics.totalTokens += usage.totalTokens ?? 0;
  metrics.estimatedCost += usage.estimatedCost ?? 0;
  tab.metrics[agentId] = metrics;
}

export function applyDownstreamPromptCost(
  receivingAgent: AgentConfig,
  visibleMessages: AgentContextMessage[],
  usage: TransportUsage | undefined,
  tab: ChatTabState,
): void {
  const promptCostUsd = getPromptCostUsd(receivingAgent, usage);
  if (promptCostUsd <= 0) return;

  const listenedMessages = visibleMessages.filter(
    (message) => message.senderId !== receivingAgent.id,
  );
  if (!listenedMessages.length) return;

  const promptCostPerMessage = promptCostUsd / listenedMessages.length;
  for (const visibleMessage of listenedMessages) {
    const entry = findMessageEntryById(visibleMessage.id, tab);
    if (!entry) continue;
    const message = entry.message;

    message.downstreamPromptCostUsd =
      (message.downstreamPromptCostUsd ?? 0) + promptCostPerMessage;
    const existingContributors =
      message.downstreamPromptCostContributors ?? [];
    const existingContributor = existingContributors.find(
      (c) => c.agentId === receivingAgent.id,
    );
    if (existingContributor) {
      existingContributor.promptCostUsd += promptCostPerMessage;
      existingContributor.listenCount += 1;
    } else {
      existingContributors.push({
        agentId: receivingAgent.id,
        promptCostUsd: promptCostPerMessage,
        listenCount: 1,
      });
    }
    message.downstreamPromptCostContributors = existingContributors;
    message.costUsd =
      (message.requestCostUsd ?? 0) + message.downstreamPromptCostUsd;
  }
}
