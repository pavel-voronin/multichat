import type {
  ChatMessage,
  ChatTabState,
  SendMessageInput,
  SendSystemMessageInput,
  WorkspaceState,
} from './types';
import { pushDebugLog, updateMessageSourceTrace } from './diagnostics';
import { SYSTEM_AUTHOR_NAME } from './messages';

export function publishMessageToTab(
  input: Omit<SendMessageInput, 'senderId'> & {
    senderId?: string;
    kind?: ChatMessage['kind'];
    system?: ChatMessage['system'];
  },
  tab: ChatTabState,
  workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { message: ChatMessage; triggersSweep: boolean } {
  if (input.target === 'private' && !input.recipientId) {
    throw new Error('Private message requires recipientId');
  }
  if (input.kind !== 'system' && !input.senderId) {
    throw new Error('Participant message requires senderId');
  }

  const triggersSweep = input.triggerSweep ?? true;
  const createdInSweep =
    input.createdInSweep ??
    (triggersSweep ? tab.execution.sweepCount + 1 : undefined);

  const message: ChatMessage = {
    id: createId(),
    author:
      input.kind === 'system'
        ? { type: 'system' }
        : { type: 'participant', participantId: input.senderId! },
    kind: input.kind ?? 'participant',
    target: input.target,
    recipientId: input.recipientId,
    content: input.content.trim(),
    system: input.system,
    createdAt: now().toISOString(),
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

  tab.timeline.push({
    id: message.id,
    createdAt: message.createdAt,
    kind: 'message',
    message,
  });
  updateMessageSourceTrace(message.id, input.sourceTraceId, tab);

  const senderName =
    input.kind === 'system'
      ? SYSTEM_AUTHOR_NAME
      : (tab.participants.find((p) => p.id === input.senderId)?.name ??
        input.senderId ??
        '');

  pushDebugLog({
    now,
    workspace,
    payload: {
      kind: 'message-created',
      sweep: message.createdInSweep,
      messageId: message.id,
      agentId: input.kind === 'system' ? undefined : input.senderId,
      agentName: senderName,
      target: message.target,
      recipientId: message.recipientId,
      content: message.content,
      details: triggersSweep
        ? 'message triggers sweep'
        : 'message does not trigger sweep',
    },
  });

  return { message, triggersSweep };
}

export function publishSystemMessageToTab(
  input: SendSystemMessageInput,
  tab: ChatTabState,
  workspace: WorkspaceState,
  now: () => Date,
  createId: () => string,
): { message: ChatMessage; triggersSweep: boolean } {
  return publishMessageToTab(
    {
      content: input.content,
      target: 'public',
      triggerSweep: input.triggerSweep,
      kind: 'system',
      system: input.system,
    },
    tab,
    workspace,
    now,
    createId,
  );
}
