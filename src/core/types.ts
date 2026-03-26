import type { TurnOrderingConfig } from './turn-ordering/types';

export type ParticipantRole = 'human' | 'agent';

export type MessageTarget = 'public' | 'private';
export type DebugLogKind =
  | 'tab-created'
  | 'tab-renamed'
  | 'tab-closed'
  | 'agent-created'
  | 'agent-updated'
  | 'agent-removed'
  | 'human-updated'
  | 'settings-updated'
  | 'history-cutoff-set'
  | 'history-cleared'
  | 'message-created'
  | 'sweep-started'
  | 'sweep-finished'
  | 'sweep-stopped'
  | 'turn-requested'
  | 'turn-skipped'
  | 'turn-result'
  | 'runtime-error'
  | 'runtime-reset';
export type AgentExecutionMode = 'tools';
export type RequestTraceStatus = 'running' | 'succeeded' | 'failed' | 'aborted';
export type RequestTraceLinkKind =
  | 'parent'
  | 'child'
  | 'triggering-message'
  | 'visible-message'
  | 'produced-message';

export interface Participant {
  id: string;
  name: string;
  role: ParticipantRole;
}

export interface AgentConfig {
  id: string;
  name: string;
  modelId: string;
  isEnabled?: boolean;
  isHidden?: boolean;
  archivedAt?: string | null;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  modelSnapshot?: ModelSnapshot;
  systemPrompt: string;
}

export interface ChatPresetAgent {
  name: string;
  systemPrompt: string;
  modelId: string;
}

export interface ChatPreset {
  version: 1;
  id: string;
  title: string;
  initialMessage: string;
  agents: ChatPresetAgent[];
}

export interface RequestTraceUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  promptCostUsd?: number;
  requestCostUsd?: number;
}

export interface RequestTracePayloads {
  requestInputJson?: unknown;
  responseOutputJson?: unknown;
  normalizedActionJson?: unknown;
  sanitizedJson?: unknown;
}

export interface RequestTraceTransportMeta {
  provider?: string;
  modelId?: string;
  executionMode?: AgentExecutionMode;
  aborted?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface RequestTraceLink {
  kind: RequestTraceLinkKind;
  traceId?: string;
  messageId?: string;
}

export interface RequestTrace {
  id: string;
  sweep: number;
  agentId: string;
  agentName: string;
  mode: AgentExecutionMode;
  fallback: boolean;
  status: RequestTraceStatus;
  startedAt: string;
  finishedAt?: string;
  triggeringMessageIds: string[];
  visibleMessageIds: string[];
  nonSelfVisibleMessageIds: string[];
  producedMessageId?: string;
  parentTraceId?: string | null;
  childTraceIds: string[];
  upstreamMessageIds: string[];
  downstreamMessageIds: string[];
  usage?: RequestTraceUsage;
  pricingSnapshot?: {
    prompt?: string;
    completion?: string;
  };
  transport?: RequestTraceTransportMeta;
  payloads: RequestTracePayloads;
  links: RequestTraceLink[];
}

export interface AgentMetrics {
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface SettingsState {
  openRouterApiKey: string;
}

export interface ModelsCatalogSnapshot {
  models: OpenRouterModel[];
  lastFetchedAt: number;
  apiKeyFingerprint: string | null;
}

export interface RuntimeError {
  id: string;
  createdAt: string;
  agentId?: string;
  message: string;
  details?: string;
  sourceTraceId?: string;
}

export interface TimelineHistoryCutoffEntry {
  id: string;
  createdAt: string;
  kind: 'history-cutoff';
  cutoff: {
    source: 'manual';
  };
}

export interface ChatEntryBase {
  id: string;
  createdAt: string;
  sourceTraceId?: string;
  costUsd?: number;
  requestCostUsd?: number;
  ownPromptCostUsd?: number;
  downstreamPromptCostUsd?: number;
  downstreamPromptCostContributors?: Array<{
    agentId: string;
    promptCostUsd: number;
    listenCount: number;
  }>;
}

export interface ParticipantMessageEntry extends ChatEntryBase {
  kind: 'participant-message';
  authorId: string;
  content: string;
  target: MessageTarget;
  recipientId?: string;
  createdInSweep?: number;
}

export interface ParticipantJoinedEntry extends ChatEntryBase {
  kind: 'participant-joined';
  participantId: string;
  participantName: string;
}

export interface ParticipantLeftEntry extends ChatEntryBase {
  kind: 'participant-left';
  participantId: string;
  participantName: string;
}

export interface TopicChangedEntry extends ChatEntryBase {
  kind: 'topic-changed';
  topicTitle: string;
}

export interface SilentDecisionEntry extends ChatEntryBase {
  kind: 'silent-decision';
  agentId: string;
  reason: string;
}

export interface RuntimeErrorEntry extends ChatEntryBase {
  kind: 'runtime-error';
  agentId: string;
  details: string;
}

export interface SweepStartedEntry extends ChatEntryBase {
  kind: 'sweep-started';
  agentId?: string;
}

export interface SweepFinishedEntry extends ChatEntryBase {
  kind: 'sweep-finished';
  agentId?: string;
}

export interface SweepStoppedEntry extends ChatEntryBase {
  kind: 'sweep-stopped';
  agentId?: string;
}

export type ChatEntry =
  | ParticipantMessageEntry
  | ParticipantJoinedEntry
  | ParticipantLeftEntry
  | TopicChangedEntry
  | SilentDecisionEntry
  | RuntimeErrorEntry
  | SweepStartedEntry
  | SweepFinishedEntry
  | SweepStoppedEntry;

export interface EntryInspectionIndex {
  sourceTraceId?: string;
  downstreamTraceIds: string[];
  triggeringTraceIds: string[];
  visibleTraceIds: string[];
}

export type TimelineEntry = ChatEntry | TimelineHistoryCutoffEntry;

export interface DebugLogEntry {
  id: string;
  createdAt: string;
  kind: DebugLogKind;
  sweep?: number;
  trigger?: string;
  agentId?: string;
  agentName?: string;
  mode?: AgentExecutionMode;
  fallback?: boolean;
  skipReason?: string;
  actionType?: 'speak_public' | 'send_private' | 'stay_silent';
  messageId?: string;
  target?: MessageTarget;
  recipientId?: string;
  details?: string;
  content?: string;
  visibleMessageIds?: string[];
  nonSelfVisibleMessageIds?: string[];
  triggeringMessageIds?: string[];
  contextKeyPrev?: string;
  contextKeyNext?: string;
}

export interface ExecutionState {
  isSweepRunning: boolean;
  queuedSweep: boolean;
  sweepCount: number;
  stopRequested: boolean;
}

export type TabMutationSource = 'user' | 'system' | 'future-event';

export interface ChatTabState {
  id: string;
  title: string;
  participants: Participant[];
  agents: AgentConfig[];
  timeline: TimelineEntry[];
  metrics: Record<string, AgentMetrics>;
  execution: ExecutionState;
  maxAutoRounds: number;
  requestTraces: Record<string, RequestTrace>;
  entryInspectionIndex: Record<string, EntryInspectionIndex>;
  turnOrdering: TurnOrderingConfig;
}

export interface WorkspaceState {
  settings: SettingsState;
  modelsCatalogSnapshot?: ModelsCatalogSnapshot | null;
  debugLogs: DebugLogEntry[];
  errors: RuntimeError[];
  tabs: ChatTabState[];
  activeTabId: string;
}

export interface RuntimeState {
  activeTabId: string;
  participants: Participant[];
  agents: AgentConfig[];
  timeline: TimelineEntry[];
  metrics: Record<string, AgentMetrics>;
  settings: SettingsState;
  execution: ExecutionState;
  maxAutoRounds: number;
  turnOrdering: TurnOrderingConfig;
}

export interface DiagnosticsState {
  activeTabId: string;
  debugLogs: DebugLogEntry[];
  errors: RuntimeError[];
  requestTraces: Record<string, RequestTrace>;
  entryInspectionIndex: Record<string, EntryInspectionIndex>;
}

export interface SendMessageInput {
  senderId: string;
  content: string;
  target: MessageTarget;
  recipientId?: string;
  costUsd?: number;
  requestCostUsd?: number;
  ownPromptCostUsd?: number;
  downstreamPromptCostUsd?: number;
  downstreamPromptCostContributors?: Array<{
    agentId: string;
    promptCostUsd: number;
    listenCount: number;
  }>;
  createdInSweep?: number;
  sourceTraceId?: string;
  triggerSweep?: boolean;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  context_length: number;
  supported_parameters: string[];
}

export interface ModelSnapshot {
  contextLength: number;
  supportedParameters: string[];
}

export interface TransportUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  requestPayloadJson?: unknown;
  responsePayloadJson?: unknown;
  transportMeta?: Record<string, unknown>;
}

export type AgentToolCall =
  | { type: 'speak_public'; text: string }
  | { type: 'send_private'; to: string; text: string }
  | { type: 'stay_silent'; reason: string };

export interface AgentTurnResult {
  mode: AgentExecutionMode;
  action: AgentToolCall;
  usage?: TransportUsage;
}

export interface AgentContextMessage {
  id: string;
  authorType: 'participant' | 'system';
  senderName: string;
  senderId?: string;
  target: MessageTarget;
  recipientId?: string;
  recipientName?: string;
  content: string;
  createdAt: string;
}

export interface AgentTurnContext {
  agent: AgentConfig;
  participants: Participant[];
  visibleMessages: AgentContextMessage[];
}

export interface OpenRouterTransport {
  listModels(apiKey: string): Promise<OpenRouterModel[]>;
  runAgentTurn(input: {
    apiKey: string;
    context: AgentTurnContext;
    signal?: AbortSignal;
  }): Promise<AgentTurnResult>;
}

export interface PersistenceAdapter {
  load(): Promise<Partial<WorkspaceState> | null>;
  save(state: WorkspaceState): Promise<void>;
  reset(): Promise<void>;
}

export interface RuntimeConfig {
  transport: OpenRouterTransport;
  storage?: PersistenceAdapter;
  initialState?: Partial<WorkspaceState> | null;
  now?: () => Date;
  idGenerator?: () => string;
  humanParticipant?: Participant;
  maxAutoSweeps?: number;
}
