import type {
  ChatTabState,
  MessageTarget,
  ParticipantJoinedEntry,
  ParticipantLeftEntry,
  ParticipantMessageEntry,
  TopicChangedEntry,
  WorkspaceState,
} from './types';
import { pushDebugLog, updateEntrySourceTrace } from './diagnostics';

export function publishParticipantMessage(
  input: {
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
  },
  tab: ChatTabState,
  workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { entry: ParticipantMessageEntry; triggersSweep: boolean } {
  if (input.target === 'private' && !input.recipientId) {
    throw new Error('Private message requires recipientId');
  }

  const triggersSweep = input.triggerSweep ?? true;
  const createdInSweep =
    input.createdInSweep ??
    (triggersSweep ? tab.execution.sweepCount + 1 : undefined);

  const entry: ParticipantMessageEntry = {
    id: createId(),
    kind: 'participant-message',
    createdAt: now().toISOString(),
    authorId: input.senderId,
    content: input.content.trim(),
    target: input.target,
    recipientId: input.recipientId,
    requestCostUsd: input.requestCostUsd ?? input.costUsd,
    ownPromptCostUsd: input.ownPromptCostUsd,
    downstreamPromptCostUsd: input.downstreamPromptCostUsd,
    downstreamPromptCostContributors: input.downstreamPromptCostContributors,
    costUsd:
      (input.requestCostUsd ?? input.costUsd ?? 0) +
        (input.downstreamPromptCostUsd ?? 0) || undefined,
    createdInSweep,
    sourceTraceId: input.sourceTraceId,
  };

  tab.timeline.push(entry);
  updateEntrySourceTrace(entry.id, input.sourceTraceId, tab);

  const senderName =
    tab.participants.find((p) => p.id === input.senderId)?.name ??
    input.senderId ??
    '';

  pushDebugLog({
    now,
    workspace,
    payload: {
      kind: 'message-created',
      sweep: entry.createdInSweep,
      messageIds: [entry.id],
      agentId: input.senderId,
      agentName: senderName,
      details: `${JSON.stringify(entry.content)} ${triggersSweep ? 'triggers sweep' : 'no sweep'}`,
    },
  });

  return { entry, triggersSweep };
}

export function publishParticipantJoined(
  input: {
    participantId: string;
    participantName: string;
    triggerSweep?: boolean;
  },
  tab: ChatTabState,
  _workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { entry: ParticipantJoinedEntry; triggersSweep: boolean } {
  const entry: ParticipantJoinedEntry = {
    id: createId(),
    kind: 'participant-joined',
    createdAt: now().toISOString(),
    participantId: input.participantId,
    participantName: input.participantName,
  };
  tab.timeline.push(entry);
  return { entry, triggersSweep: input.triggerSweep ?? true };
}

export function publishParticipantLeft(
  input: {
    participantId: string;
    participantName: string;
    triggerSweep?: boolean;
  },
  tab: ChatTabState,
  _workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { entry: ParticipantLeftEntry; triggersSweep: boolean } {
  const entry: ParticipantLeftEntry = {
    id: createId(),
    kind: 'participant-left',
    createdAt: now().toISOString(),
    participantId: input.participantId,
    participantName: input.participantName,
  };
  tab.timeline.push(entry);
  return { entry, triggersSweep: input.triggerSweep ?? true };
}

export function publishTopicChanged(
  input: { topicTitle: string; triggerSweep?: boolean },
  tab: ChatTabState,
  _workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { entry: TopicChangedEntry; triggersSweep: boolean } {
  const entry: TopicChangedEntry = {
    id: createId(),
    kind: 'topic-changed',
    createdAt: now().toISOString(),
    topicTitle: input.topicTitle,
  };
  tab.timeline.push(entry);
  return { entry, triggersSweep: input.triggerSweep ?? true };
}
