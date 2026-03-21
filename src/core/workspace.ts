import type {
  AgentConfig,
  AgentMetrics,
  ChatTabState,
  Participant,
  RuntimeConfig,
  SettingsState,
  WorkspaceState,
} from './types';
import { deepClone } from './utils';

export const DEFAULT_HUMAN = {
  id: 'human',
  name: 'Human',
  role: 'human',
} as const;

export const DEFAULT_TAB_TITLE = '#default';

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
  contextWindowSize: number;
}): ChatTabState {
  return {
    id: input.id,
    title: input.title ?? DEFAULT_TAB_TITLE,
    contextWindowSize: input.contextWindowSize,
    participants: [deepClone(input.human)],
    agents: [],
    timeline: [],
    metrics: {},
    execution: initialExecutionState(),
    requestTraces: {},
    messageInspectionIndex: {},
  };
}

export function initialWorkspace(config: RuntimeConfig): WorkspaceState {
  const human = config.humanParticipant ?? DEFAULT_HUMAN;
  const tabId = 'tab-default';
  const contextWindowSize = config.maxContextMessages ?? 40;
  return {
    settings: initialSettings(config),
    debugLogs: [],
    errors: [],
    tabs: [
      createEmptyTabState({
        id: tabId,
        human,
        contextWindowSize,
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
    .map((tab) => normalizeTabState(tab))
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
    debugLogs: persisted.debugLogs ?? [],
    errors: persisted.errors ?? [],
    tabs,
    activeTabId,
  };
}

export function normalizeTabState(
  tab: Partial<ChatTabState>,
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
    contextWindowSize:
      typeof tab.contextWindowSize === 'number' && tab.contextWindowSize > 0
        ? Math.floor(tab.contextWindowSize)
        : 40,
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
    requestTraces: tab.requestTraces ?? {},
    messageInspectionIndex: tab.messageInspectionIndex ?? {},
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
