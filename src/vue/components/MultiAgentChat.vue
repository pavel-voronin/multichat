<template>
  <div class="playground-shell">
    <div class="playground-layout">
      <ChatToolbar
        class="playground-toolbar-row"
        :show-context-cutoffs="state.settings.showContextCutoffs"
        :cost-display-mode="state.settings.costDisplayMode"
        :show-silent-decisions="state.settings.showSilentDecisions"
        :show-logs="showLogsPanel"
        :can-stop="canStop"
        @toggle-cutoffs="toggleContextCutoffs"
        @toggle-cost-mode="toggleCostDisplayMode"
        @toggle-silent-decisions="toggleSilentDecisions"
        @toggle-logs="toggleLogsPanel"
        @reset-agents="runtime.resetAgentHistoryContext()"
        @stop="runtime.stop()"
        @open-settings="showSettings = true"
      />

      <section class="chat-column">
        <div ref="messageLog" class="chat-log" @scroll="updatePinnedState">
          <template v-for="entry in chatTimelineEntries" :key="entry.id">
            <article
              v-if="entry.kind === 'message'"
              :class="messageClasses(entry)"
            >
              <span class="message-time"
                >[{{ formatMessageTime(entry.message.createdAt) }}]</span
              ><span class="message-separator">{{
                inlineMessageSeparator
              }}</span
              ><span
                class="message-sender"
                @dblclick="handleMessageSenderDblClick(entry.message)"
                >{{ formatMessageAuthor(entry.message) }}</span
              ><template v-if="shouldShowMessageCost(entry.message)">
                <span class="message-separator">{{
                  inlineMessageSeparator
                }}</span
                ><span class="message-cost">
                  <span
                    class="message-cost-trigger"
                    :class="messageCostSummaryClass(entry.message)"
                    @mouseenter="openCostBubble(entry.message.id, $event)"
                    @mouseleave="scheduleCostBubbleClose"
                    >{{
                      formatMessageCost(displayedMessageCost(entry.message))
                    }}</span
                  >
                </span>
              </template
              ><span class="message-separator">{{ inlineMessageSeparator }}</span
              ><span class="message-text">{{ entry.message.content }}</span>
            </article>
            <article
              v-else-if="entry.kind === 'technical-event'"
              :class="technicalEventClasses(entry.event)"
            >
              <span class="message-time"
                >[{{ formatMessageTime(entry.event.createdAt) }}]</span
              ><span class="message-separator">{{
                inlineMessageSeparator
              }}</span
              ><span class="runtime-label"
                >{{ formatTechnicalEventLabel(entry.event) }}</span
              ><span class="message-separator">{{ inlineMessageSeparator }}</span
              ><span class="runtime-text"
                >{{ formatTechnicalEventText(entry.event) }}</span
              >
            </article>

            <div v-else class="cutoff-stack">
              <div
                v-if="entry.cutoff.source === 'manual'"
                class="cutoff-banner cutoff-banner-manual"
              >
                <span class="cutoff-copy">
                  <span class="cutoff-title">History cleared for agents</span>
                  <span class="cutoff-manual-copy">
                    Messages above stay visible but are excluded from agent
                    context.
                  </span>
                  <button
                    type="button"
                    class="cutoff-link"
                    @click="clearHistoryBeforeCutoff"
                  >
                    Clear chat history
                  </button>
                </span>
              </div>

              <div
                v-else
                class="cutoff-banner cutoff-banner-preview"
              >
                <span class="cutoff-copy">{{ entry.cutoff.label }}</span>
              </div>
            </div>
          </template>
        </div>

        <div class="composer-panel">
          <div class="composer-row">
            <UiTextarea
              ref="composer"
              v-model="draftMessage"
              class="composer-input"
              rows="1"
              placeholder="Type a message"
              @keydown="handleComposerKeydown"
            />

            <div class="composer-actions">
              <UiButton
                class="send-button"
                variant="primary"
                :disabled="!canSend"
                @click="sendCurrentMessage"
              >
                Send
              </UiButton>
            </div>
          </div>
        </div>
      </section>

      <aside class="sidebar-column">
        <section class="participants-column">
          <header class="participants-header">
            <h2 class="participants-title">Participants</h2>
            <UiButton
              class="participants-add-button"
              size="sm"
              aria-label="Add participant"
              @click="
                editingAgentId = null;
                showAgentWizard = true;
              "
            >
              Add
            </UiButton>
          </header>

          <ul class="participants-list">
            <li
              v-for="participant in visibleParticipants"
              :key="participant.id"
              class="participant-row"
              @dblclick="handleParticipantDblClick(participant)"
            >
              <div class="participant-copy">
                <span class="participant-heading">
                  <span class="participant-name">{{ participant.name }}</span>
                  <span
                    v-if="showParticipantMoney(participant)"
                    class="participant-price-trigger"
                    @mouseenter="openModelPriceBubble(participant.id, $event)"
                    @mouseleave="scheduleModelPriceBubbleClose"
                    >{{ participantSpentSummary(participant) }}</span
                  >
                </span>
                <span class="participant-role">{{
                  participantSubtitle(participant)
                }}</span>
              </div>
              <div class="participant-actions">
                <UiButton
                  class="participant-edit-button"
                  size="sm"
                  @click="
                    participant.role === 'agent'
                      ? ((editingAgentId = participant.id),
                        (showAgentWizard = true))
                      : (showHumanNameModal = true)
                  "
                >
                  Edit
                </UiButton>
                <UiButton
                  v-if="participant.role === 'agent'"
                  class="participant-delete-button"
                  variant="danger"
                  size="sm"
                  @click="openDeleteAgentModal(participant)"
                >
                  Delete
                </UiButton>
              </div>
            </li>
          </ul>
        </section>
      </aside>

      <section v-if="showLogsPanel" class="logs-panel">
        <header class="logs-panel-header">
          <h2 class="logs-panel-title">Logs</h2>
          <span class="logs-panel-meta"
            >{{ state.debugLogs.length }} entries</span
          >
        </header>
        <div
          ref="logsPanel"
          class="logs-panel-body"
          @scroll="updateLogsPinnedState"
        >
          <pre class="logs-panel-text">{{ formattedDebugLogs }}</pre>
        </div>
      </section>
    </div>

    <SettingsModal
      v-model="showSettings"
      :api-key="state.settings.openRouterApiKey"
      :default-context-window-size="state.settings.defaultContextWindowSize"
      @save="
        runtime.updateSettings({
          openRouterApiKey: $event.apiKey,
          defaultContextWindowSize: $event.defaultContextWindowSize,
        })
      "
      @reset="resetApp"
    />

    <HumanNameModal
      v-model="showHumanNameModal"
      :name="human?.name ?? 'Human'"
      @save="runtime.updateHumanParticipant({ name: $event.name })"
    />

    <AgentWizard
      v-model="showAgentWizard"
      :api-key-present="Boolean(state.settings.openRouterApiKey)"
      :agent="editingAgent"
      :fetch-models="() => runtime.listModels()"
      @save="saveAgent"
      @open-settings="openSettingsFromAgentWizard"
    />

    <Teleport to="body">
      <div
        v-if="showDeleteAgentConfirm"
        class="delete-agent-modal-backdrop"
        @click.self="closeDeleteAgentModal"
      >
        <div class="delete-agent-modal-card">
          <h2 class="delete-agent-modal-title">Hide agent?</h2>
          <p class="delete-agent-modal-copy">
            {{ deleteAgentModalCopy }}
          </p>
          <div class="delete-agent-modal-actions">
            <UiButton
              class="delete-agent-modal-primary-button"
              variant="danger"
              @click="confirmDeleteAgent"
            >
              Hide and disable
            </UiButton>
            <UiButton
              class="delete-agent-modal-secondary-button"
              @click="closeDeleteAgentModal"
            >
              Cancel
            </UiButton>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="hoveredCostBubbleMessage"
        ref="costBubble"
        class="message-cost-bubble message-cost-bubble-teleported"
        :class="`message-cost-bubble-${costBubblePlacement}`"
        :style="costBubbleStyle"
        @mouseenter="cancelCostBubbleClose"
        @mouseleave="closeCostBubble"
      >
        <span class="message-cost-bubble-title">
          {{ costBubbleTitle(hoveredCostBubbleMessage) }}
        </span>
        <span
          v-if="requestMessageCost(hoveredCostBubbleMessage) > 0"
          class="message-cost-row"
        >
          <span class="message-cost-label">Request</span>
          <span class="message-cost-request">{{
            formatMessageCost(requestMessageCost(hoveredCostBubbleMessage))
          }}</span>
        </span>
        <span
          v-if="
            state.settings.costDisplayMode === 'net' &&
            ownPromptMessageCost(hoveredCostBubbleMessage) > 0
          "
          class="message-cost-row"
        >
          <span class="message-cost-label">Own input</span>
          <span class="message-cost-input"
            >-{{
              formatMessageCost(ownPromptMessageCost(hoveredCostBubbleMessage))
            }}</span
          >
        </span>
        <span
          v-if="
            state.settings.costDisplayMode === 'net' &&
            downstreamMessageCost(hoveredCostBubbleMessage) > 0
          "
          class="message-cost-row"
        >
          <span class="message-cost-label"
            >Readers ({{
              totalDownstreamListenCount(hoveredCostBubbleMessage)
            }})</span
          >
          <span class="message-cost-output"
            >+{{
              formatMessageCost(downstreamMessageCost(hoveredCostBubbleMessage))
            }}</span
          >
        </span>
        <span
          v-for="contributor in downstreamCostContributors(
            hoveredCostBubbleMessage,
          )"
          :key="`${hoveredCostBubbleMessage.id}-${contributor.agentId}`"
          class="message-cost-row message-cost-row-contributor"
        >
          <span class="message-cost-label"
            >{{ contributor.agentName }} x{{ contributor.listenCount }}</span
          >
          <span class="message-cost-output">{{
            formatContributorCost(contributor.promptCostUsd)
          }}</span>
        </span>
        <span class="message-cost-row message-cost-row-total">
          <span class="message-cost-label">Shown</span>
          <span :class="messageCostSummaryClass(hoveredCostBubbleMessage)">{{
            formatMessageCost(displayedMessageCost(hoveredCostBubbleMessage))
          }}</span>
        </span>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="hoveredModelPriceAgent"
        ref="modelPriceBubble"
        class="message-cost-bubble message-cost-bubble-teleported"
        :class="`message-cost-bubble-${modelPriceBubblePlacement}`"
        :style="modelPriceBubbleStyle"
        @mouseenter="cancelModelPriceBubbleClose"
        @mouseleave="closeModelPriceBubble"
      >
        <span class="message-cost-bubble-title">
          {{ hoveredModelPriceAgent.name }}
        </span>
        <span class="message-cost-row">
          <span class="message-cost-label">Prompt</span>
          <span class="message-cost-request">{{
            formatMessageCost(agentPromptPrice(hoveredModelPriceAgent))
          }}</span>
        </span>
        <span class="message-cost-row">
          <span class="message-cost-label">Completion</span>
          <span class="message-cost-output">{{
            formatMessageCost(agentCompletionPrice(hoveredModelPriceAgent))
          }}</span>
        </span>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import {
  createMultiChatRuntime,
  LocalStoragePersistenceAdapter,
  OpenRouterHttpTransport,
  type AgentConfig,
  type ChatMessage,
  type CostDisplayMode,
  type DebugLogEntry,
  type MultiChatRuntime,
  type Participant,
  type RuntimeEvent,
  type VisibleTimelineEntry,
} from '../../core';
import { useRuntimeState } from '../useRuntimeState';
import AgentWizard from './AgentWizard.vue';
import ChatToolbar from './ChatToolbar.vue';
import HumanNameModal from './HumanNameModal.vue';
import SettingsModal from './SettingsModal.vue';
import UiButton from './ui/UiButton.vue';
import UiTextarea from './ui/UiTextarea.vue';

const props = defineProps<{
  runtime?: MultiChatRuntime;
}>();

const runtime =
  props.runtime ??
  createMultiChatRuntime({
    transport: new OpenRouterHttpTransport(),
    storage: new LocalStoragePersistenceAdapter(),
  });

const state = useRuntimeState(runtime);
const showSettings = ref(false);
const showAgentWizard = ref(false);
const showHumanNameModal = ref(false);
const reopenAgentWizardAfterSettings = ref(false);
const editingAgentId = ref<string | null>(null);
const draftMessage = ref('');
const showDeleteAgentConfirm = ref(false);
const pendingDeleteAgentId = ref<string | null>(null);
const pendingDeleteAgentName = ref('');
const inlineMessageSeparator = ' ';
const composerRef = useTemplateRef<{ focus: () => void }>('composer');
const messageLogRef = useTemplateRef<HTMLDivElement>('messageLog');
const costBubbleRef = useTemplateRef<HTMLDivElement>('costBubble');
const modelPriceBubbleRef = useTemplateRef<HTMLDivElement>('modelPriceBubble');
const logsPanelRef = useTemplateRef<HTMLDivElement>('logsPanel');
const isPinnedToBottom = ref(true);
const isLogsPinnedToBottom = ref(true);
const hoveredCostMessageId = ref<string | null>(null);
const hoveredCostTriggerElement = ref<HTMLElement | null>(null);
const costBubbleStyle = ref<Record<string, string>>({});
const costBubblePlacement = ref<'up' | 'down'>('down');
let costBubbleCloseTimeout: ReturnType<typeof setTimeout> | null = null;
const hoveredModelPriceAgentId = ref<string | null>(null);
const hoveredModelPriceTriggerElement = ref<HTMLElement | null>(null);
const modelPriceBubbleStyle = ref<Record<string, string>>({});
const modelPriceBubblePlacement = ref<'up' | 'down'>('down');
let modelPriceBubbleCloseTimeout: ReturnType<typeof setTimeout> | null = null;
let messageLogResizeObserver: ResizeObserver | null = null;
const showLogsPanel = ref(false);

const agents = computed(() => state.value.agents);
const visibleParticipants = computed(() =>
  state.value.participants.filter((participant) => {
    if (participant.role === 'human') {
      return true;
    }

    const agent = agents.value.find((item) => item.id === participant.id);
    return agent?.isHidden !== true;
  }),
);
const human = computed(() =>
  state.value.participants.find((participant) => participant.role === 'human'),
);
const canSend = computed(
  () => Boolean(draftMessage.value.trim()) && Boolean(human.value),
);
const canStop = computed(() => state.value.execution.isSweepRunning);
const chatTimelineEntries = computed(() =>
  runtime.getVisibleTimelineEntries({
    participantId: human.value?.id ?? 'human',
    filters: {
      showTechnicalEvents: state.value.settings.showSilentDecisions,
      showPreviewCutoffs: state.value.settings.showContextCutoffs,
    },
  }),
);
const visibleMessages = computed(() =>
  chatTimelineEntries.value
    .filter((entry): entry is Extract<VisibleTimelineEntry, { kind: 'message' }> => entry.kind === 'message')
    .map((entry) => entry.message),
);

const editingAgent = computed<AgentConfig | null>(
  () => agents.value.find((agent) => agent.id === editingAgentId.value) ?? null,
);
const hoveredModelPriceAgent = computed<AgentConfig | null>(
  () =>
    agents.value.find((agent) => agent.id === hoveredModelPriceAgentId.value) ??
    null,
);
const deleteAgentModalCopy = computed(() =>
  pendingDeleteAgentName.value
    ? `Agent "${pendingDeleteAgentName.value}" will disappear from the sidebar and stop participating in sweeps, but its name will remain in chat history.`
    : 'This agent will disappear from the sidebar and stop participating in sweeps, but its name will remain in chat history.',
);
const formattedDebugLogs = computed(() =>
  state.value.debugLogs.map(formatDebugLogLine).join('\n'),
);

watch(showSettings, (isOpen, wasOpen) => {
  if (isOpen || !wasOpen || !reopenAgentWizardAfterSettings.value) {
    return;
  }

  reopenAgentWizardAfterSettings.value = false;
  showAgentWizard.value = true;
});

watch(
  () => chatTimelineEntries.value.length,
  async () => {
    await nextTick();
    scrollMessageLogToBottomIfPinned();
    updateCostBubblePosition();
    updateModelPriceBubblePosition();
  },
);

watch(
  () => state.value.debugLogs.length,
  async () => {
    await nextTick();
    scrollLogsToBottomIfPinned();
  },
);

const hoveredCostBubbleMessage = computed(() => {
  if (!hoveredCostMessageId.value) {
    return null;
  }

  return (
    visibleMessages.value.find(
      (message) => message.id === hoveredCostMessageId.value,
    ) ?? null
  );
});

onMounted(() => {
  const messageLog = messageLogRef.value;
  if (!messageLog) {
    return;
  }

  updatePinnedState();
  messageLog.scrollTop = messageLog.scrollHeight;
  isPinnedToBottom.value = true;

  if (typeof ResizeObserver === 'undefined') {
    return;
  }

  messageLogResizeObserver = new ResizeObserver(() => {
    void nextTick().then(() => scrollMessageLogToBottomIfPinned());
  });
  messageLogResizeObserver.observe(messageLog);

  window.addEventListener('resize', updateCostBubblePosition);
  window.addEventListener('scroll', updateCostBubblePosition, true);
  window.addEventListener('resize', updateModelPriceBubblePosition);
  window.addEventListener('scroll', updateModelPriceBubblePosition, true);
});

onBeforeUnmount(() => {
  messageLogResizeObserver?.disconnect();
  window.removeEventListener('resize', updateCostBubblePosition);
  window.removeEventListener('scroll', updateCostBubblePosition, true);
  window.removeEventListener('resize', updateModelPriceBubblePosition);
  window.removeEventListener('scroll', updateModelPriceBubblePosition, true);
  if (costBubbleCloseTimeout) {
    clearTimeout(costBubbleCloseTimeout);
  }
  if (modelPriceBubbleCloseTimeout) {
    clearTimeout(modelPriceBubbleCloseTimeout);
  }
});

function isNearBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 12;
}

function updatePinnedState() {
  const messageLog = messageLogRef.value;
  if (!messageLog) {
    return;
  }

  isPinnedToBottom.value = isNearBottom(messageLog);
  updateCostBubblePosition();
  updateModelPriceBubblePosition();
}

function updateLogsPinnedState() {
  const logsPanel = logsPanelRef.value;
  if (!logsPanel) {
    return;
  }

  isLogsPinnedToBottom.value = isNearBottom(logsPanel);
}

function scrollMessageLogToBottomIfPinned() {
  const messageLog = messageLogRef.value;
  if (!messageLog || !isPinnedToBottom.value) {
    return;
  }

  messageLog.scrollTop = messageLog.scrollHeight;
}

function scrollLogsToBottomIfPinned() {
  const logsPanel = logsPanelRef.value;
  if (!logsPanel || !isLogsPinnedToBottom.value) {
    return;
  }

  logsPanel.scrollTop = logsPanel.scrollHeight;
}

function senderName(message: ChatMessage): string {
  return (
    state.value.participants.find(
      (participant) => participant.id === message.senderId,
    )?.name ?? message.senderId
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

function recipientName(message: ChatMessage): string {
  if (!message.recipientId) {
    return 'all';
  }

  return (
    state.value.participants.find(
      (participant) => participant.id === message.recipientId,
    )?.name ?? message.recipientId
  );
}

function formatMessageTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatMessageAuthor(message: ChatMessage): string {
  const sender = senderName(message);

  if (message.target === 'private') {
    return `<${sender} -> ${recipientName(message)}>`;
  }

  return `<${sender}>`;
}

function formatTechnicalEventLabel(event: RuntimeEvent): string {
  if (event.type === 'silent-decision') {
    const agentName = event.agentId
      ? state.value.participants.find(
          (participant) => participant.id === event.agentId,
        )?.name
      : null;
    return agentName ? `[silent ${agentName}]` : '[silent]';
  }

  const agentName = event.agentId
    ? state.value.participants.find(
        (participant) => participant.id === event.agentId,
      )?.name
    : null;
  return agentName ? `[error ${agentName}]` : '[error]';
}

function formatTechnicalEventText(event: RuntimeEvent): string {
  if (event.type === 'silent-decision') {
    return `stayed silent: ${event.details}`;
  }

  return event.details ? `request failed: ${event.details}` : 'request failed';
}

function technicalEventClasses(event: RuntimeEvent): string {
  return event.type === 'runtime-error'
    ? 'runtime-line runtime-line-error'
    : 'runtime-line runtime-line-silent';
}

function formatDebugLogLine(entry: DebugLogEntry): string {
  const segments = [`[${formatMessageTime(entry.createdAt)}]`, entry.kind];

  if (typeof entry.sweep === 'number' && entry.sweep > 0) {
    segments.push(`sweep=${entry.sweep}`);
  }

  if (entry.agentName || entry.agentId) {
    segments.push(`agent=${entry.agentName ?? entry.agentId}`);
  }

  if (entry.agentId) {
    segments.push(`agentId=${entry.agentId}`);
  }

  if (entry.mode) {
    segments.push(`mode=${entry.mode}`);
  }

  if (typeof entry.fallback === 'boolean') {
    segments.push(`fallback=${entry.fallback ? 'yes' : 'no'}`);
  }

  if (entry.trigger) {
    segments.push(`trigger=${entry.trigger}`);
  }

  if (entry.skipReason) {
    segments.push(`skip=${entry.skipReason}`);
  }

  if (entry.actionType) {
    segments.push(`action=${entry.actionType}`);
  }

  if (entry.messageId) {
    segments.push(`messageId=${entry.messageId}`);
  }

  if (entry.target) {
    segments.push(`target=${entry.target}`);
  }

  if (entry.recipientId) {
    segments.push(`recipientId=${entry.recipientId}`);
  }

  if (entry.triggeringMessageIds?.length) {
    segments.push(`triggering=[${entry.triggeringMessageIds.join(', ')}]`);
  }

  if (entry.visibleMessageIds?.length) {
    segments.push(`visible=[${entry.visibleMessageIds.join(', ')}]`);
  }

  if (entry.nonSelfVisibleMessageIds?.length) {
    segments.push(`nonSelf=[${entry.nonSelfVisibleMessageIds.join(', ')}]`);
  }

  if (entry.contextKeyPrev !== undefined) {
    segments.push(`ctxPrev=${entry.contextKeyPrev || '∅'}`);
  }

  if (entry.contextKeyNext !== undefined) {
    segments.push(`ctxNext=${entry.contextKeyNext || '∅'}`);
  }

  if (entry.content) {
    segments.push(`content=${JSON.stringify(entry.content)}`);
  }

  if (entry.details) {
    segments.push(`details=${JSON.stringify(entry.details)}`);
  }

  return segments.join(' ');
}

function formatMessageCost(costUsd: number): string {
  const minimumFractionDigits = costUsd > 0 && costUsd < 0.0001 ? 6 : 4;

  return `$${costUsd.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  })}`;
}

function formatContributorCost(costUsd: number): string {
  return formatMessageCost(costUsd);
}

function openCostBubble(messageId: string, event: MouseEvent) {
  cancelCostBubbleClose();
  hoveredCostMessageId.value = messageId;
  hoveredCostTriggerElement.value = event.currentTarget as HTMLElement;
  void nextTick().then(() => updateCostBubblePosition());
}

function scheduleCostBubbleClose() {
  cancelCostBubbleClose();
  costBubbleCloseTimeout = setTimeout(() => {
    closeCostBubble();
  }, 80);
}

function cancelCostBubbleClose() {
  if (!costBubbleCloseTimeout) {
    return;
  }

  clearTimeout(costBubbleCloseTimeout);
  costBubbleCloseTimeout = null;
}

function closeCostBubble() {
  cancelCostBubbleClose();
  hoveredCostMessageId.value = null;
  hoveredCostTriggerElement.value = null;
}

function updateCostBubblePosition() {
  const triggerElement = hoveredCostTriggerElement.value;
  const bubble = costBubbleRef.value;
  if (!triggerElement || !bubble) {
    return;
  }

  const anchorRect = triggerElement.getBoundingClientRect();

  const gap = 8;
  const bubbleRect = bubble.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - anchorRect.bottom;
  const spaceAbove = anchorRect.top;
  const placeDown =
    spaceBelow >= bubbleRect.height + gap || spaceBelow >= spaceAbove;

  costBubblePlacement.value = placeDown ? 'down' : 'up';

  const unclampedLeft = anchorRect.left;
  const left = Math.min(
    Math.max(gap, unclampedLeft),
    viewportWidth - bubbleRect.width - gap,
  );
  const top = placeDown
    ? Math.min(
        anchorRect.bottom + gap,
        viewportHeight - bubbleRect.height - gap,
      )
    : Math.max(gap, anchorRect.top - bubbleRect.height - gap);

  costBubbleStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
  };
}

function openModelPriceBubble(participantId: string, event: MouseEvent) {
  cancelModelPriceBubbleClose();
  hoveredModelPriceAgentId.value = participantId;
  hoveredModelPriceTriggerElement.value = event.currentTarget as HTMLElement;
  void nextTick().then(() => updateModelPriceBubblePosition());
}

function scheduleModelPriceBubbleClose() {
  cancelModelPriceBubbleClose();
  modelPriceBubbleCloseTimeout = setTimeout(() => {
    closeModelPriceBubble();
  }, 80);
}

function cancelModelPriceBubbleClose() {
  if (!modelPriceBubbleCloseTimeout) {
    return;
  }

  clearTimeout(modelPriceBubbleCloseTimeout);
  modelPriceBubbleCloseTimeout = null;
}

function closeModelPriceBubble() {
  cancelModelPriceBubbleClose();
  hoveredModelPriceAgentId.value = null;
  hoveredModelPriceTriggerElement.value = null;
}

function updateModelPriceBubblePosition() {
  const triggerElement = hoveredModelPriceTriggerElement.value;
  const bubble = modelPriceBubbleRef.value;
  if (!triggerElement || !bubble) {
    return;
  }

  const anchorRect = triggerElement.getBoundingClientRect();
  const gap = 8;
  const bubbleRect = bubble.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - anchorRect.bottom;
  const spaceAbove = anchorRect.top;
  const placeDown =
    spaceBelow >= bubbleRect.height + gap || spaceBelow >= spaceAbove;

  modelPriceBubblePlacement.value = placeDown ? 'down' : 'up';

  const left = Math.min(
    Math.max(gap, anchorRect.left),
    viewportWidth - bubbleRect.width - gap,
  );
  const top = placeDown
    ? Math.min(
        anchorRect.bottom + gap,
        viewportHeight - bubbleRect.height - gap,
      )
    : Math.max(gap, anchorRect.top - bubbleRect.height - gap);

  modelPriceBubbleStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
  };
}

function requestMessageCost(message: ChatMessage): number {
  if (typeof message.requestCostUsd === 'number') {
    return message.requestCostUsd;
  }

  if (
    typeof message.ownPromptCostUsd !== 'number' &&
    typeof message.downstreamPromptCostUsd !== 'number'
  ) {
    return message.costUsd ?? 0;
  }

  return 0;
}

function ownPromptMessageCost(message: ChatMessage): number {
  return message.ownPromptCostUsd ?? 0;
}

function downstreamMessageCost(message: ChatMessage): number {
  return message.downstreamPromptCostUsd ?? 0;
}

function displayedMessageCost(message: ChatMessage): number {
  if (state.value.settings.costDisplayMode === 'request') {
    return requestMessageCost(message);
  }

  return (
    requestMessageCost(message) -
    ownPromptMessageCost(message) +
    downstreamMessageCost(message)
  );
}

function shouldShowMessageCost(message: ChatMessage): boolean {
  if (state.value.settings.costDisplayMode === 'off') {
    return false;
  }

  return displayedMessageCost(message) > 0;
}

function messageCostSummaryClass(message: ChatMessage): string {
  return state.value.settings.costDisplayMode === 'request'
    ? 'message-cost-request'
    : displayedMessageCost(message) >= requestMessageCost(message)
      ? 'message-cost-total'
      : 'message-cost-net';
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
      agentName:
        state.value.participants.find(
          (participant) => participant.id === contributor.agentId,
        )?.name ?? contributor.agentId,
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

  const agent = agents.value.find((item) => item.id === participant.id) ?? null;
  if (!agent || agent.isHidden) {
    return null;
  }

  return agent;
}

function agentPromptPrice(agent: AgentConfig | null | undefined): number {
  const promptPrice = Number(agent?.pricing?.prompt);
  return Number.isFinite(promptPrice) && promptPrice > 0 ? promptPrice : 0;
}

function agentCompletionPrice(agent: AgentConfig | null | undefined): number {
  const completionPrice = Number(agent?.pricing?.completion);
  return Number.isFinite(completionPrice) && completionPrice > 0
    ? completionPrice
    : 0;
}

function showParticipantMoney(participant: Participant): boolean {
  if (state.value.settings.costDisplayMode === 'off') {
    return false;
  }

  const agent = participantAgent(participant);
  return agent !== null;
}

function participantEstimatedCost(participant: Participant): number {
  const agent = participantAgent(participant);
  if (!agent) {
    return 0;
  }

  return state.value.metrics[agent.id]?.estimatedCost ?? 0;
}

function participantSpentSummary(participant: Participant): string {
  return formatMessageCost(participantEstimatedCost(participant));
}

function costBubbleTitle(message: ChatMessage): string {
  return state.value.settings.costDisplayMode === 'request'
    ? 'Outgoing request cost'
    : `Net cost for ${formatMessageAuthor(message)}`;
}

function messageClasses(
  entry: Extract<VisibleTimelineEntry, { kind: 'message' }>,
): string {
  const baseClass =
    entry.message.target === 'private' ? 'message-line-private' : 'message-line';

  return entry.isMuted ? `${baseClass} message-line-muted` : baseClass;
}

async function sendCurrentMessage() {
  if (!canSend.value || !human.value) {
    return;
  }

  const content = draftMessage.value;

  draftMessage.value = '';
  await nextTick();
  composerRef.value?.focus();

  await runtime.sendMessage({
    senderId: human.value.id,
    content,
    target: 'public',
  });
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendCurrentMessage();
  }
}

function handleParticipantDblClick(participant: Participant) {
  draftMessage.value = addParticipantMentionPrefix(
    draftMessage.value,
    participant.name,
  );
  void nextTick().then(() => composerRef.value?.focus());
}

function openDeleteAgentModal(participant: Participant) {
  if (participant.role !== 'agent') {
    return;
  }

  pendingDeleteAgentId.value = participant.id;
  pendingDeleteAgentName.value = participant.name;
  showDeleteAgentConfirm.value = true;
}

function closeDeleteAgentModal() {
  showDeleteAgentConfirm.value = false;
  pendingDeleteAgentId.value = null;
  pendingDeleteAgentName.value = '';
}

function confirmDeleteAgent() {
  if (!pendingDeleteAgentId.value) {
    closeDeleteAgentModal();
    return;
  }

  runtime.removeAgent(pendingDeleteAgentId.value);
  closeDeleteAgentModal();
}

function handleMessageSenderDblClick(message: ChatMessage) {
  const participant = state.value.participants.find(
    (item) => item.id === message.senderId,
  );
  if (!participant) {
    return;
  }

  handleParticipantDblClick(participant);
}

function addParticipantMentionPrefix(
  content: string,
  participantName: string,
): string {
  const prefixMatch = content.match(/^([^:]+):\s*/);
  const existingMentions = (prefixMatch?.[1] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const messageBody = prefixMatch
    ? content.slice(prefixMatch[0].length)
    : content;

  if (!existingMentions.includes(participantName)) {
    existingMentions.push(participantName);
  }

  return `${existingMentions.join(', ')}: ${messageBody}`;
}

function openSettingsFromAgentWizard() {
  reopenAgentWizardAfterSettings.value = showAgentWizard.value;
  showAgentWizard.value = false;
  showSettings.value = true;
}

function toggleContextCutoffs() {
  runtime.updateSettings({
    showContextCutoffs: !state.value.settings.showContextCutoffs,
  });
}

function toggleCostDisplayMode() {
  const nextModeByCurrent: Record<CostDisplayMode, CostDisplayMode> = {
    off: 'request',
    request: 'net',
    net: 'off',
  };
  const nextMode = nextModeByCurrent[state.value.settings.costDisplayMode];
  runtime.updateSettings({
    costDisplayMode: nextMode,
  });
}

function toggleSilentDecisions() {
  runtime.updateSettings({
    showSilentDecisions: !state.value.settings.showSilentDecisions,
  });
}

function toggleLogsPanel() {
  showLogsPanel.value = !showLogsPanel.value;
  if (showLogsPanel.value) {
    isLogsPinnedToBottom.value = true;
    void nextTick().then(() => scrollLogsToBottomIfPinned());
  }
}

function clearHistoryBeforeCutoff() {
  runtime.clearHistoryBeforeAgentCutoff();
}

async function saveAgent(payload: {
  id?: string;
  name: string;
  modelId: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  systemPrompt: string;
  contextWindowSize: number | null;
}) {
  if (payload.id) {
    runtime.updateAgent(payload.id, {
      name: payload.name,
      modelId: payload.modelId,
      pricing: payload.pricing,
      systemPrompt: payload.systemPrompt,
      contextWindowSize: payload.contextWindowSize,
    });
    return;
  }

  runtime.createAgent({
    name: payload.name,
    modelId: payload.modelId,
    pricing: payload.pricing,
    systemPrompt: payload.systemPrompt,
    contextWindowSize: payload.contextWindowSize,
    capabilities: {
      prefersTools: true,
      supportsToolUse: 'unknown',
    },
  });
}

function resetApp() {
  runtime.reset();
  draftMessage.value = '';
  reopenAgentWizardAfterSettings.value = false;
  showSettings.value = false;
}
</script>

<style scoped>
@reference "../../styles.css";

.playground-shell {
  @apply relative isolate h-full min-h-0 overflow-hidden bg-neutral-100 p-2 font-mono text-[13px] text-neutral-900;
}

.playground-layout {
  @apply grid min-h-0 grid-cols-[minmax(0,1fr)_17rem] grid-rows-[auto_minmax(0,1fr)_auto] gap-2;
  height: 100%;
}

.playground-toolbar-row {
  @apply col-span-2 w-full;
}

.chat-column {
  @apply h-full grid min-h-0 grid-rows-[minmax(0,1fr)_auto] rounded-md border border-neutral-300 bg-white;
}

.chat-log {
  @apply min-h-0 overflow-auto px-4 py-3;
}

.message-line {
  @apply block whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-800;
}

.message-line-private {
  @apply block whitespace-pre-wrap break-words text-[13px] leading-6 text-orange-700 italic;
}

.runtime-line {
  @apply block whitespace-pre-wrap break-words text-[12px] leading-5;
}

.runtime-line-silent {
  @apply text-sky-800;
}

.runtime-line-error {
  @apply text-red-800;
}

.message-line-muted {
  @apply text-neutral-500;
}

.message-time {
  @apply text-neutral-500;
}

.message-sender {
  @apply whitespace-nowrap rounded font-semibold text-neutral-700 transition-colors hover:bg-neutral-200/80;
}

.runtime-label {
  @apply font-semibold text-sky-900;
}

.runtime-line-error .runtime-label {
  @apply text-red-900;
}

.message-separator {
  @apply whitespace-pre;
}

.message-cost {
  @apply relative inline;
}

.message-cost-trigger {
  @apply cursor-default rounded;
}

.message-cost-bubble {
  @apply grid min-w-56 gap-1 rounded-md border border-green-900/15 bg-white px-3 py-2 text-[11px] leading-4 text-neutral-800 shadow-lg;
}

.message-cost-bubble-teleported {
  @apply fixed z-50;
}

.message-cost-bubble-up {
  transform-origin: bottom left;
}

.message-cost-bubble-down {
  transform-origin: top left;
}

.message-cost-bubble-title {
  @apply mb-1 font-semibold text-neutral-900;
}

.message-cost-row {
  @apply flex items-start justify-between gap-3;
}

.message-cost-row-contributor {
  @apply text-[10px];
}

.message-cost-row-total {
  @apply mt-1 border-t border-neutral-200 pt-1 font-semibold;
}

.message-cost-label {
  @apply text-neutral-600;
}

.message-cost-request {
  @apply text-emerald-700;
}

.delete-agent-modal-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/20 p-6 backdrop-blur-sm;
}

.delete-agent-modal-card {
  @apply w-full max-w-md rounded-md border border-neutral-300 bg-white p-5 font-mono text-[13px] text-neutral-900 shadow-xl;
}

.delete-agent-modal-title {
  @apply m-0 text-base font-semibold;
}

.delete-agent-modal-copy {
  @apply mt-3 text-[12px] leading-5 text-neutral-600;
}

.delete-agent-modal-actions {
  @apply mt-5 flex gap-2;
}

.message-cost-input {
  @apply text-green-600;
}

.message-cost-output {
  @apply text-lime-700;
}

.message-cost-total {
  @apply text-green-800;
}

.message-cost-net {
  @apply text-teal-700;
}

.message-text {
  @apply text-current;
}

.runtime-text {
  @apply text-current;
}

.cutoff-stack {
  @apply grid gap-1;
}

.cutoff-banner {
  @apply relative isolate flex h-5 items-center overflow-hidden text-[11px] leading-5;
}

.cutoff-banner-preview {
  @apply w-full text-left text-red-800/65;
}

.cutoff-banner-manual {
  @apply w-full text-left text-amber-800/80;
}

.cutoff-banner-preview::before {
  content: '';
  @apply absolute left-0 right-0 top-1/2 border-t border-dashed border-red-500/45;
}

.cutoff-banner-manual::before {
  content: '';
  @apply absolute left-0 right-0 top-1/2 border-t border-dashed border-amber-500/45;
}

.cutoff-title {
  @apply font-semibold text-current;
}

.cutoff-copy {
  @apply relative z-[1] ml-2 bg-white px-1;
}

.cutoff-manual-copy {
  @apply ml-2;
}

.cutoff-link {
  @apply ml-2 cursor-pointer border-0 bg-transparent p-0 text-[11px] font-medium text-amber-900 underline decoration-amber-700/60 underline-offset-2;
}

.cutoff-link:hover {
  @apply text-amber-950 decoration-amber-900;
}

.composer-panel {
  @apply border-t border-neutral-300 bg-neutral-50 px-3 py-2;
}

.composer-row {
  @apply flex items-end gap-2;
}

.composer-input {
  @apply field-sizing-content min-h-[30px] max-h-40 flex-1 resize-none overflow-auto px-3 py-1 text-[13px] leading-5;
}

.composer-actions {
  @apply flex shrink-0 gap-2 self-end;
}

.sidebar-column {
  @apply grid h-full min-h-0;
}

.logs-panel {
  @apply col-span-2 grid h-56 min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-neutral-300 bg-neutral-950 text-neutral-100;
}

.logs-panel-header {
  @apply flex items-center justify-between border-b border-neutral-700 px-3 py-2;
}

.logs-panel-title {
  @apply text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-200;
}

.logs-panel-meta {
  @apply text-[11px] text-neutral-400;
}

.logs-panel-body {
  @apply min-h-0 overflow-auto px-3 py-2;
}

.logs-panel-text {
  @apply m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-neutral-100;
}

.participants-column {
  @apply grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-neutral-300 bg-white;
}

.participants-header {
  @apply flex items-center justify-between border-b border-neutral-300 px-3 py-1.5;
}

.participants-title {
  @apply text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-600;
}

.participants-add-button {
  @apply px-2;
}

.participants-list {
  @apply m-0 h-full min-h-0 list-none overflow-auto p-1.5;
}

.participant-row {
  @apply relative flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[12px] leading-4 transition hover:bg-neutral-50;
}

.participant-copy {
  @apply min-w-0 pr-2;
}

.participant-heading {
  @apply inline-flex max-w-full items-baseline gap-1;
}

.participant-name {
  @apply block truncate text-[13px] font-semibold text-neutral-900;
}

.participant-price-trigger {
  @apply shrink-0 cursor-default text-[11px] font-semibold text-emerald-800;
}

.participant-role {
  @apply block truncate text-[11px] uppercase tracking-[0.06em] text-neutral-500;
}

.participant-edit-button {
  @apply px-2;
}

.participant-actions {
  @apply pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 bg-linear-to-l from-white via-white to-transparent pl-6 opacity-0 transition;
}

.participant-delete-button {
  @apply px-2 text-red-700;
}

.participant-row:hover .participant-actions {
  @apply pointer-events-auto opacity-100;
}

@media (max-width: 900px) {
  .playground-layout {
    @apply grid-cols-1 grid-rows-[auto_minmax(0,1fr)_12rem_auto];
  }

  .playground-toolbar-row {
    @apply col-span-1;
  }

  .chat-column {
    @apply order-2;
  }

  .sidebar-column {
    @apply order-3;
  }

  .logs-panel {
    @apply col-span-1 order-4;
  }
}
</style>
