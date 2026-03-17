import { computed, type Ref } from 'vue';
import type {
  AgentConfig,
  ChatMessage,
  MultiChatRuntime,
  Participant,
  RuntimeEvent,
  RuntimeState,
  VisibleTimelineEntry,
} from '../../core';
import {
  formatDebugLogLine,
  formatMessageAuthor,
  formatTechnicalEventLabel,
} from '../utils/chatFormatting';
import {
  displayedMessageCost as calculateDisplayedMessageCost,
  formatMessageCost,
  messageCostSummaryClass as calculateMessageCostSummaryClass,
  shouldShowMessageCost as calculateShouldShowMessageCost,
} from '../utils/costing';

export interface ParticipantRowView {
  id: string;
  name: string;
  role: Participant['role'];
  subtitle: string;
  showMoney: boolean;
  spentSummary: string;
}

export function useChatViewModel(input: {
  state: Readonly<Ref<RuntimeState>>;
  runtime: MultiChatRuntime;
  onParticipantDblClick?: (participant: Participant) => void;
}) {
  const agents = computed(() => input.state.value.agents);
  const human = computed(() =>
    input.state.value.participants.find((participant) => participant.role === 'human'),
  );
  const chatTimelineEntries = computed(() =>
    input.runtime.getVisibleTimelineEntries({
      participantId: human.value?.id ?? 'human',
      filters: {
        showTechnicalEvents: input.state.value.settings.showSilentDecisions,
        showPreviewCutoffs: input.state.value.settings.showContextCutoffs,
      },
    }),
  );
  const visibleMessages = computed(() =>
    chatTimelineEntries.value
      .filter(
        (
          entry,
        ): entry is Extract<VisibleTimelineEntry, { kind: 'message' }> =>
          entry.kind === 'message',
      )
      .map((entry) => entry.message),
  );
  const formattedDebugLogs = computed(() =>
    input.state.value.debugLogs.map(formatDebugLogLine).join('\n'),
  );

  const visibleParticipants = computed(() =>
    input.state.value.participants.filter((participant) => {
      if (participant.role === 'human') {
        return true;
      }

      const agent = agents.value.find((item) => item.id === participant.id);
      return agent?.isHidden !== true;
    }),
  );

  const participantRows = computed<ParticipantRowView[]>(() =>
    visibleParticipants.value.map((participant) => ({
      id: participant.id,
      name: participant.name,
      role: participant.role,
      subtitle: participantSubtitle(participant),
      showMoney: showParticipantMoney(participant),
      spentSummary: participantSpentSummary(participant),
    })),
  );

  function participantNameById(participantId: string): string | null {
    return (
      input.state.value.participants.find(
        (participant) => participant.id === participantId,
      )?.name ?? null
    );
  }

  function participantSubtitle(participant: Participant): string {
    if (participant.role === 'human') {
      return 'human';
    }

    return (
      agents.value.find((agent) => agent.id === participant.id)?.modelId ??
      participant.role
    );
  }

  function formatMessageAuthorForView(message: ChatMessage): string {
    return formatMessageAuthor(message, {
      byId: participantNameById,
    });
  }

  function formatTechnicalEventLabelForView(event: RuntimeEvent): string {
    return formatTechnicalEventLabel(event, {
      byId: participantNameById,
    });
  }

  function displayedMessageCost(message: ChatMessage): number {
    return calculateDisplayedMessageCost(
      message,
      input.state.value.settings.costDisplayMode,
    );
  }

  function shouldShowMessageCost(message: ChatMessage): boolean {
    return calculateShouldShowMessageCost(
      message,
      input.state.value.settings.costDisplayMode,
    );
  }

  function messageCostSummaryClass(message: ChatMessage): string {
    return calculateMessageCostSummaryClass(
      message,
      input.state.value.settings.costDisplayMode,
    );
  }

  function downstreamCostContributors(message: ChatMessage): Array<{
    agentId: string;
    agentName: string;
    promptCostUsd: number;
    listenCount: number;
  }> {
    return (message.downstreamPromptCostContributors ?? []).map(
      (contributor) => ({
        agentId: contributor.agentId,
        agentName: participantNameById(contributor.agentId) ?? contributor.agentId,
        promptCostUsd: contributor.promptCostUsd,
        listenCount: contributor.listenCount,
      }),
    );
  }

  function totalDownstreamListenCount(message: ChatMessage): number {
    return downstreamCostContributors(message).reduce(
      (sum, contributor) => sum + contributor.listenCount,
      0,
    );
  }

  function participantAgent(participant: Participant): AgentConfig | null {
    if (participant.role !== 'agent') {
      return null;
    }

    const agent =
      agents.value.find((item) => item.id === participant.id) ?? null;
    if (!agent || agent.isHidden) {
      return null;
    }

    return agent;
  }

  function showParticipantMoney(participant: Participant): boolean {
    if (input.state.value.settings.costDisplayMode === 'off') {
      return false;
    }

    return participantAgent(participant) !== null;
  }

  function participantEstimatedCost(participant: Participant): number {
    const agent = participantAgent(participant);
    if (!agent) {
      return 0;
    }

    return input.state.value.metrics[agent.id]?.estimatedCost ?? 0;
  }

  function participantSpentSummary(participant: Participant): string {
    return formatMessageCost(participantEstimatedCost(participant));
  }

  function costBubbleTitle(message: ChatMessage): string {
    return input.state.value.settings.costDisplayMode === 'request'
      ? 'Outgoing request cost'
      : `Net cost for ${formatMessageAuthorForView(message)}`;
  }

  function messageClasses(
    entry: Extract<VisibleTimelineEntry, { kind: 'message' }>,
  ): string {
    const baseClass =
      entry.message.target === 'private' ? 'message-line-private' : 'message-line';

    return entry.isMuted ? `${baseClass} message-line-muted` : baseClass;
  }

  function handleParticipantDblClickById(participantId: string) {
    if (!input.onParticipantDblClick) {
      return;
    }

    const participant = input.state.value.participants.find(
      (item) => item.id === participantId,
    );
    if (!participant) {
      return;
    }

    input.onParticipantDblClick(participant);
  }

  return {
    agents,
    human,
    chatTimelineEntries,
    visibleMessages,
    formattedDebugLogs,
    participantRows,
    formatMessageAuthorForView,
    formatTechnicalEventLabelForView,
    displayedMessageCost,
    shouldShowMessageCost,
    messageCostSummaryClass,
    downstreamCostContributors,
    totalDownstreamListenCount,
    costBubbleTitle,
    messageClasses,
    handleParticipantDblClickById,
  };
}
