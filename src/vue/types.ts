import type {
  AgentConfig,
  ChatMessage,
  RuntimeEvent,
  TimelineHistoryCutoffEntry,
  TimelineMessageEntry,
  TimelineTechnicalEventEntry,
} from '../core';

export type CostDisplayMode = 'off' | 'request' | 'net';

export interface ChatViewPreferences {
  showSilentDecisions: boolean;
  costDisplayMode: CostDisplayMode;
}

export type VisibleTimelineMessageEntry = TimelineMessageEntry & {
  sortAt: number;
  isMuted: boolean;
};

export type VisibleTimelineTechnicalEventEntry = TimelineTechnicalEventEntry & {
  sortAt: number;
};

export type VisibleTimelineManualCutoffEntry = TimelineHistoryCutoffEntry & {
  sortAt: number;
};

export type VisibleTimelineEntry =
  | VisibleTimelineMessageEntry
  | VisibleTimelineTechnicalEventEntry
  | VisibleTimelineManualCutoffEntry;

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

export type CostTrackedItem = Pick<
  ChatMessage | RuntimeEvent,
  | 'costUsd'
  | 'requestCostUsd'
  | 'ownPromptCostUsd'
  | 'downstreamPromptCostUsd'
  | 'downstreamPromptCostContributors'
>;

export type RenderedAgent = AgentConfig;
