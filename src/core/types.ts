export type ParticipantRole = 'human' | 'agent';
export type MessageTarget = 'public' | 'private';
export type RuntimeEventType =
  | 'sweep-started'
  | 'sweep-finished'
  | 'silent-decision'
  | 'runtime-error'
  | 'sweep-stopped';
export type DebugLogKind =
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
export type AgentExecutionMode = 'tools' | 'json';
export type ToolSupport = 'unknown' | 'supported' | 'unsupported';
export type CostDisplayMode = 'off' | 'request' | 'net';
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

export interface AgentCapabilities {
  prefersTools: boolean;
  supportsToolUse: ToolSupport;
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
  systemPrompt: string;
  contextWindowSize?: number | null;
  capabilities: AgentCapabilities;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  target: MessageTarget;
  recipientId?: string;
  content: string;
  createdAt: string;
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

export interface MessageInspectionIndex {
  sourceTraceId?: string;
  downstreamTraceIds: string[];
  triggeringTraceIds: string[];
  visibleTraceIds: string[];
}

export interface AgentMetrics {
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface ContextCutoffAnchor {
  kind: 'start' | 'before-message' | 'after-message' | 'end';
  messageId?: string;
}

export interface AgentContextCutoff {
  anchor: ContextCutoffAnchor;
  agentIds: string[];
  agentNames: string[];
  usesGlobalWindow: boolean;
}

export interface SettingsState {
  openRouterApiKey: string;
  defaultContextWindowSize: number;
  showContextCutoffs: boolean;
  showSilentDecisions: boolean;
  costDisplayMode: CostDisplayMode;
}

export interface RuntimeError {
  id: string;
  createdAt: string;
  agentId?: string;
  message: string;
  details?: string;
  sourceTraceId?: string;
}

export interface RuntimeEvent {
  id: string;
  createdAt: string;
  type: RuntimeEventType;
  agentId?: string;
  details?: string;
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

export interface TimelineEntryBase {
  id: string;
  createdAt: string;
}

export interface TimelineMessageEntry extends TimelineEntryBase {
  kind: 'message';
  message: ChatMessage;
}

export interface TimelineTechnicalEventEntry extends TimelineEntryBase {
  kind: 'technical-event';
  event: RuntimeEvent;
}

export interface TimelineHistoryCutoffEntry extends TimelineEntryBase {
  kind: 'history-cutoff';
  cutoff: {
    source: 'manual' | 'preview';
    label?: string;
    anchor?: ContextCutoffAnchor;
    agentIds?: string[];
    agentNames?: string[];
    usesGlobalWindow?: boolean;
  };
}

export type TimelineEntry =
  | TimelineMessageEntry
  | TimelineTechnicalEventEntry
  | TimelineHistoryCutoffEntry;

export interface TimelineFilterState {
  showTechnicalEvents: boolean;
  showPreviewCutoffs: boolean;
}

export type VisibleTimelineEntry =
  | (TimelineMessageEntry & {
      sortAt: number;
      isMuted: boolean;
    })
  | (TimelineTechnicalEventEntry & {
      sortAt: number;
    })
  | (TimelineHistoryCutoffEntry & {
      sortAt: number;
    });

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

export interface RuntimeState {
  participants: Participant[];
  agents: AgentConfig[];
  timeline: TimelineEntry[];
  metrics: Record<string, AgentMetrics>;
  settings: SettingsState;
  debugLogs: DebugLogEntry[];
  errors: RuntimeError[];
  execution: ExecutionState;
  requestTraces: Record<string, RequestTrace>;
  messageInspectionIndex: Record<string, MessageInspectionIndex>;
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
  senderName: string;
  senderId: string;
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
    mode: AgentExecutionMode;
    signal?: AbortSignal;
  }): Promise<AgentTurnResult>;
}

export interface PersistenceAdapter {
  load(): Partial<RuntimeState> | null;
  save(state: RuntimeState): void;
  reset(): void;
}

export interface RuntimeConfig {
  transport: OpenRouterTransport;
  storage?: PersistenceAdapter;
  now?: () => Date;
  idGenerator?: () => string;
  humanParticipant?: Participant;
  maxAutoSweeps?: number;
  maxContextMessages?: number;
}
