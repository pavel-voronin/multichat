import type {
  AgentConfig,
  AgentMetrics,
  ChatTabState,
  Participant,
  RuntimeConfig,
  SettingsState,
  WorkspaceState,
} from './types';
import { DEFAULT_TURN_ORDERING } from './turn-ordering/types';
import { deepClone } from './utils';

export const DEFAULT_HUMAN = {
  id: 'human',
  name: 'Human',
  role: 'human',
} as const;

export const DEFAULT_TAB_TITLE = '#default';
export const DEFAULT_MAX_AUTO_ROUNDS = 12;

export function emptyMetrics(): AgentMetrics {
  return {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  };
}

export function normalizeAgentConfig(agent: AgentConfig): AgentConfig {
  return {
    ...agent,
    isEnabled: agent.isEnabled ?? true,
    isHidden: agent.isHidden ?? false,
    archivedAt: agent.archivedAt ?? null,
  };
}

export function initialSettings(config: RuntimeConfig): SettingsState {
  return {
    openRouterApiKey: '',
  };
}

export function initialExecutionState(): ChatTabState['execution'] {
  return {
    isSweepRunning: false,
    queuedSweep: false,
    sweepCount: 0,
    stopRequested: false,
  };
}

export function createEmptyTabState(input: {
  id: string;
  title?: string;
  human: ChatTabState['participants'][number];
  maxAutoRounds?: number;
}): ChatTabState {
  return {
    id: input.id,
    title: input.title ?? DEFAULT_TAB_TITLE,
    participants: [deepClone(input.human)],
    agents: [],
    timeline: [],
    metrics: {},
    execution: initialExecutionState(),
    maxAutoRounds: input.maxAutoRounds ?? DEFAULT_MAX_AUTO_ROUNDS,
    requestTraces: {},
    entryInspectionIndex: {},
    turnOrdering: deepClone(DEFAULT_TURN_ORDERING),
  };
}

export function initialWorkspace(config: RuntimeConfig): WorkspaceState {
  const human = config.humanParticipant ?? DEFAULT_HUMAN;
  const tabId = 'tab-default';
  return {
    settings: initialSettings(config),
    modelsCatalogSnapshot: null,
    debugLogs: [],
    errors: [],
    tabs: [
      createEmptyTabState({
        id: tabId,
        human,
        maxAutoRounds: config.maxAutoSweeps ?? DEFAULT_MAX_AUTO_ROUNDS,
      }),
    ],
    activeTabId: tabId,
  };
}

export function mergePersistedWorkspace(
  base: WorkspaceState,
  persisted: Partial<WorkspaceState> | null,
): WorkspaceState {
  if (!persisted) {
    return base;
  }

  const tabs = (persisted.tabs ?? [])
    .map((tab) => normalizeTabState(tab, base.tabs[0]?.maxAutoRounds))
    .filter(Boolean) as ChatTabState[];

  if (!tabs.length) {
    return base;
  }

  const activeTabId = tabs.some((tab) => tab.id === persisted.activeTabId)
    ? persisted.activeTabId!
    : tabs[0]!.id;

  return {
    settings: {
      ...base.settings,
      ...persisted.settings,
    },
    modelsCatalogSnapshot: persisted.modelsCatalogSnapshot ?? null,
    debugLogs: persisted.debugLogs ?? [],
    errors: persisted.errors ?? [],
    tabs,
    activeTabId,
  };
}

export function normalizeTabState(
  tab: Partial<ChatTabState>,
  defaultMaxAutoRounds = DEFAULT_MAX_AUTO_ROUNDS,
): ChatTabState | null {
  if (!tab.id) {
    return null;
  }

  const participants = tab.participants?.length
    ? tab.participants
    : [deepClone(DEFAULT_HUMAN)];

  return {
    id: tab.id,
    title:
      typeof tab.title === 'string' && tab.title.trim()
        ? tab.title
        : DEFAULT_TAB_TITLE,
    participants,
    agents: (tab.agents ?? []).map(normalizeAgentConfig),
    timeline: tab.timeline ?? [],
    metrics: tab.metrics ?? {},
    execution: {
      ...initialExecutionState(),
      ...tab.execution,
      isSweepRunning: false,
      queuedSweep: false,
      stopRequested: false,
    },
    maxAutoRounds:
      typeof tab.maxAutoRounds === 'number' && Number.isFinite(tab.maxAutoRounds)
        ? Math.max(1, Math.floor(tab.maxAutoRounds))
        : defaultMaxAutoRounds,
    requestTraces: tab.requestTraces ?? {},
    entryInspectionIndex: tab.entryInspectionIndex ?? {},
    turnOrdering: deepClone(tab.turnOrdering ?? DEFAULT_TURN_ORDERING),
  };
}

export function normalizeTabTitle(title: string | undefined | null): string {
  return title?.trim() ?? '';
}

export function resolveAutoTabTitle(
  tabs: ChatTabState[],
  preferredTitle?: string,
  excludeTabId?: string,
): string {
  const normalizedPreferred = normalizeTabTitle(preferredTitle);
  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  const titles = new Set(
    tabs.filter((tab) => tab.id !== excludeTabId).map((tab) => tab.title),
  );
  if (!titles.has(DEFAULT_TAB_TITLE)) {
    return DEFAULT_TAB_TITLE;
  }

  let index = 2;
  while (titles.has(`${DEFAULT_TAB_TITLE}${index}`)) {
    index += 1;
  }

  return `${DEFAULT_TAB_TITLE}${index}`;
}

export function syncParticipants(
  tab: ChatTabState,
  humanParticipant: Participant = DEFAULT_HUMAN,
): void {
  const human =
    tab.participants.find((participant) => participant.role === 'human') ??
    deepClone(humanParticipant);
  tab.participants = [
    human,
    ...tab.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: 'agent' as const,
    })),
  ];
}
