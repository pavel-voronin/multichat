import { getActiveAgents } from './context-routing';
import type {
  ChatTabState,
  AgentConfig,
  ParticipantMessageEntry,
} from './types';
import { applyMentionBoost } from './turn-ordering/mention-boost';
import { applyCheapFirst } from './turn-ordering/strategies/cheap-first';
import { applyExpensiveFirst } from './turn-ordering/strategies/expensive-first';
import { applyKeywords } from './turn-ordering/strategies/keywords';
import { applyManualOrder } from './turn-ordering/strategies/manual-order';
import { applyRandom } from './turn-ordering/strategies/random';
import { applySequential } from './turn-ordering/strategies/sequential';
import { applySlidingCycle } from './turn-ordering/strategies/sliding-cycle';

function applyStrategy(
  agents: AgentConfig[],
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  switch (tab.turnOrdering.strategy) {
    case 'sequential':
      return applySequential(agents);
    case 'cheap_first':
      return applyCheapFirst(agents);
    case 'expensive_first':
      return applyExpensiveFirst(agents);
    case 'random':
      return applyRandom(agents, tab.execution.sweepCount);
    case 'keywords':
      return applyKeywords(
        agents,
        tab.turnOrdering.keywords,
        triggeringMessage,
      );
    case 'manual_order':
      return applyManualOrder(agents, tab.turnOrdering.order);
    case 'sliding_cycle':
      return applySlidingCycle(agents, tab.turnOrdering.offset);
  }
}

export function buildAgentQueue(
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  const activeAgents = getActiveAgents(tab);
  const baseQueue = applyStrategy(activeAgents, tab, triggeringMessage);
  return applyMentionBoost(baseQueue, triggeringMessage);
}
