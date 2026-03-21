import type {
  AgentConfig,
  ChatMessage,
  ContextCutoffAnchor,
  RuntimeEvent,
  TimelineEntryBase,
  TimelineHistoryCutoffEntry,
  TimelineMessageEntry,
  TimelineTechnicalEventEntry,
} from '../core';

export type CostDisplayMode = 'off' | 'request' | 'net';

export interface ChatViewPreferences {
  showContextCutoffs: boolean;
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

export interface TimelinePreviewCutoffEntry extends TimelineEntryBase {
  kind: 'history-cutoff';
  cutoff: {
    source: 'preview';
    label: string;
    anchor: ContextCutoffAnchor;
    agentIds: string[];
    agentNames: string[];
  };
  sortAt: number;
}

export type VisibleTimelineEntry =
  | VisibleTimelineMessageEntry
  | VisibleTimelineTechnicalEventEntry
  | VisibleTimelineManualCutoffEntry
  | TimelinePreviewCutoffEntry;

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
