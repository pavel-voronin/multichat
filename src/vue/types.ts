import type {
  AgentConfig,
  ChatEntry,
  ChatEntryBase,
  TimelineHistoryCutoffEntry,
} from '../core';

export type CostDisplayMode = 'off' | 'request' | 'net';

export interface ChatViewPreferences {
  showSilentDecisions: boolean;
  costDisplayMode: CostDisplayMode;
}

// All ChatEntry kinds get isMuted and sortAt for ordering.
export type VisibleChatEntry = ChatEntry & { sortAt: number; isMuted: boolean };
// HistoryCutoffEntry gets sortAt but not isMuted.
export type VisibleHistoryCutoffEntry = TimelineHistoryCutoffEntry & {
  sortAt: number;
};
export type VisibleTimelineEntry = VisibleChatEntry | VisibleHistoryCutoffEntry;

// CostTrackedItem references ChatEntryBase fields
export type CostTrackedItem = Pick<
  ChatEntryBase,
  | 'costUsd'
  | 'requestCostUsd'
  | 'ownPromptCostUsd'
  | 'downstreamPromptCostUsd'
  | 'downstreamPromptCostContributors'
>;

export interface RenderedTab {
  id: string;
  title: string;
  isActive: boolean;
  header: {
    title: string;
    badge: string | number | null;
  };
}

export interface RenderedParticipant {
  id: string;
  name: string;
  role: 'human' | 'agent';
  subtitle: string;
  showMoney: boolean;
  spentSummary: string;
}

export type RenderedAgent = AgentConfig;
