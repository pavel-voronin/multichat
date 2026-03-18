<template>
  <Teleport to="body">
    <div
      v-if="ui.showRequestInspection"
      class="inspection-backdrop"
      @click.self="inspection.close"
    >
      <div class="inspection-card">
        <header class="inspection-header">
          <div class="inspection-header-copy">
            <p class="inspection-kicker">{{ currentSubjectLabel }}</p>
            <h2 class="inspection-title">{{ currentSubjectTitle }}</h2>
            <p class="inspection-meta">
              {{ currentSubjectMeta }}
            </p>
          </div>
          <UiButton size="sm" @click="inspection.close">Close</UiButton>
        </header>

        <div class="inspection-body">
          <aside class="inspection-rail">
            <section class="inspection-rail-group">
              <h3 class="inspection-rail-title">Current</h3>
              <button
                v-if="currentMessage"
                type="button"
                class="inspection-link-card"
                @click="inspection.selectMessage(currentMessage.id)"
              >
                {{ formatMessageCard(currentMessage) }}
              </button>
              <button
                v-if="currentTrace"
                type="button"
                class="inspection-link-card"
                @click="inspection.selectTrace(currentTrace.id)"
              >
                {{ formatTraceCard(currentTrace) }}
              </button>
            </section>

            <section class="inspection-rail-group">
              <h3 class="inspection-rail-title">Caused by</h3>
              <button
                v-for="message in causalitySourceMessages"
                :key="`source-message-${message.id}`"
                type="button"
                class="inspection-link-card"
                @click="inspection.selectMessage(message.id)"
              >
                {{ formatMessageCard(message) }}
              </button>
              <button
                v-if="parentTrace"
                type="button"
                class="inspection-link-card"
                @click="inspection.selectTrace(parentTrace.id)"
              >
                {{ formatTraceCard(parentTrace) }}
              </button>
              <p
                v-if="!causalitySourceMessages.length && !parentTrace"
                class="inspection-empty"
              >
                Nothing upstream.
              </p>
            </section>

            <section class="inspection-rail-group">
              <h3 class="inspection-rail-title">Caused next</h3>
              <button
                v-for="trace in downstreamTraceCards"
                :key="trace.id"
                type="button"
                class="inspection-link-card"
                @click="inspection.selectTrace(trace.id)"
              >
                {{ formatTraceCard(trace) }}
              </button>
              <button
                v-for="message in downstreamMessages"
                :key="`downstream-message-${message.id}`"
                type="button"
                class="inspection-link-card"
                @click="inspection.selectMessage(message.id)"
              >
                {{ formatMessageCard(message) }}
              </button>
              <p
                v-if="
                  !downstreamTraceCards.length && !downstreamMessages.length
                "
                class="inspection-empty"
              >
                Nothing downstream.
              </p>
            </section>

            <section class="inspection-rail-group">
              <h3 class="inspection-rail-title">Fallbacks / errors</h3>
              <button
                v-for="trace in fallbackOrErrorTraces"
                :key="`fallback-${trace.id}`"
                type="button"
                class="inspection-link-card"
                @click="inspection.selectTrace(trace.id)"
              >
                {{ formatTraceCard(trace) }}
              </button>
              <p v-if="!fallbackOrErrorTraces.length" class="inspection-empty">
                No fallback or error traces.
              </p>
            </section>
          </aside>

          <main class="inspection-main">
            <nav class="inspection-tabs">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                type="button"
                class="inspection-tab"
                :class="{
                  'inspection-tab-active': ui.activeInspectionTab === tab.id,
                }"
                @click="inspection.setTab(tab.id)"
              >
                {{ tab.label }}
              </button>
            </nav>

            <section
              v-if="ui.activeInspectionTab === 'overview'"
              class="inspection-panel"
            >
              <p class="inspection-summary">{{ overviewText }}</p>
              <div v-if="isMessageTarget" class="inspection-block">
                <h3 class="inspection-section-title">Downstream traces</h3>
                <p class="inspection-list-heading">Triggered by this message</p>
                <div class="inspection-chip-list">
                  <button
                    v-for="trace in messageGraph?.triggeringTraces ?? []"
                    :key="`triggering-${trace.id}`"
                    type="button"
                    class="inspection-chip"
                    @click="inspection.selectTrace(trace.id)"
                  >
                    {{ formatTraceCard(trace) }}
                  </button>
                </div>
                <p class="inspection-list-heading">Visible only</p>
                <div class="inspection-chip-list">
                  <button
                    v-for="trace in messageGraph?.visibleOnlyTraces ?? []"
                    :key="`visible-${trace.id}`"
                    type="button"
                    class="inspection-chip"
                    @click="inspection.selectTrace(trace.id)"
                  >
                    {{ formatTraceCard(trace) }}
                  </button>
                </div>
              </div>
            </section>

            <section
              v-else-if="ui.activeInspectionTab === 'causality'"
              class="inspection-panel"
            >
              <div class="inspection-block">
                <h3 class="inspection-section-title">Messages</h3>
                <div class="inspection-chip-list">
                  <button
                    v-for="message in causalityMessages"
                    :key="message.id"
                    type="button"
                    class="inspection-chip"
                    @click="inspection.selectMessage(message.id)"
                  >
                    {{ formatMessageCard(message) }}
                  </button>
                </div>
              </div>
              <div class="inspection-block">
                <h3 class="inspection-section-title">Related traces</h3>
                <div class="inspection-chip-list">
                  <button
                    v-for="trace in relatedTraceCards"
                    :key="trace.id"
                    type="button"
                    class="inspection-chip"
                    @click="inspection.selectTrace(trace.id)"
                  >
                    {{ formatTraceCard(trace) }}
                  </button>
                </div>
              </div>
            </section>

            <section
              v-else-if="ui.activeInspectionTab === 'context'"
              class="inspection-panel"
            >
              <div class="inspection-block">
                <h3 class="inspection-section-title">Triggering</h3>
                <div class="inspection-chip-list">
                  <button
                    v-for="message in triggeringMessages"
                    :key="message.id"
                    type="button"
                    class="inspection-chip"
                    @click="inspection.selectMessage(message.id)"
                  >
                    {{ formatMessageCard(message) }}
                  </button>
                </div>
              </div>
              <div class="inspection-block">
                <h3 class="inspection-section-title">Visible context</h3>
                <div class="inspection-chip-list">
                  <button
                    v-for="message in visibleContextMessages"
                    :key="message.id"
                    type="button"
                    class="inspection-chip"
                    @click="inspection.selectMessage(message.id)"
                  >
                    {{ formatMessageCard(message) }}
                  </button>
                </div>
              </div>
            </section>

            <section
              v-else-if="ui.activeInspectionTab === 'output'"
              class="inspection-panel"
            >
              <div class="inspection-block">
                <h3 class="inspection-section-title">Outcome</h3>
                <p class="inspection-summary">{{ outputSummary }}</p>
              </div>
              <div class="inspection-block">
                <h3 class="inspection-section-title">Normalized action</h3>
                <pre class="inspection-json">{{
                  formatJson(currentTrace?.payloads.normalizedActionJson)
                }}</pre>
              </div>
              <div class="inspection-block">
                <h3 class="inspection-section-title">
                  {{
                    currentAction?.type === 'stay_silent'
                      ? 'Silent outcome'
                      : 'Produced message'
                  }}
                </h3>
                <button
                  v-if="producedMessage"
                  type="button"
                  class="inspection-link-card"
                  @click="inspection.selectMessage(producedMessage.id)"
                >
                  {{ formatMessageCard(producedMessage) }}
                </button>
                <p
                  v-else-if="currentAction?.type === 'stay_silent'"
                  class="inspection-empty"
                >
                  Stayed silent: {{ currentAction.reason }}
                </p>
                <p v-else class="inspection-empty">No produced message.</p>
              </div>
            </section>

            <section
              v-else-if="ui.activeInspectionTab === 'infra'"
              class="inspection-panel"
            >
              <dl class="inspection-grid">
                <div>
                  <dt>Provider</dt>
                  <dd>{{ currentTrace?.transport?.provider ?? 'n/a' }}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>
                    {{
                      currentTrace?.transport?.modelId ??
                      currentTrace?.agentName ??
                      'n/a'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{{ currentTrace?.mode ?? 'n/a' }}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{{ currentTrace?.status ?? 'n/a' }}</dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>{{ tokenSummary }}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>{{ costSummary }}</dd>
                </div>
              </dl>
              <pre class="inspection-json">{{
                formatJson(currentTrace?.transport)
              }}</pre>
            </section>

            <section v-else class="inspection-panel">
              <div class="inspection-json-actions">
                <UiButton size="sm" @click="copyRawJson">Copy</UiButton>
              </div>
              <pre class="inspection-json">{{ rawJsonText }}</pre>
            </section>
          </main>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import type { ChatMessage, RequestTrace } from '../../core';
import { useRequestInspection } from '../composables/useRequestInspection';
import { useChatStore } from '../stores/chat';
import { useUiStore } from '../stores/ui';
import {
  formatMessageAuthor,
  formatMessageTime,
} from '../utils/chatFormatting';
import { formatMessageCost } from '../utils/costing';
import UiButton from './ui/UiButton.vue';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'causality', label: 'Causality' },
  { id: 'context', label: 'Context' },
  { id: 'output', label: 'Output' },
  { id: 'infra', label: 'Infra' },
  { id: 'raw-json', label: 'Raw JSON' },
] as const;

const chat = useChatStore();
const { state } = storeToRefs(chat);
const ui = useUiStore();
const inspection = useRequestInspection({
  chat,
  state,
  ui,
});

const currentMessage = computed(() => inspection.currentMessage.value);
const currentTrace = computed(() => inspection.currentTrace.value);
const messageGraph = computed(() => inspection.messageGraph.value);
const isMessageTarget = computed(() => ui.inspectionTargetType === 'message');
const currentAction = computed(() => {
  const action = currentTrace.value?.payloads.normalizedActionJson;
  return action && typeof action === 'object'
    ? (action as {
        type?: 'speak_public' | 'send_private' | 'stay_silent';
        text?: string;
        to?: string;
        reason?: string;
      })
    : null;
});
const parentTrace = computed(() =>
  currentTrace.value?.parentTraceId
    ? chat.getRequestTrace(currentTrace.value.parentTraceId)
    : null,
);
const producedMessage = computed(() =>
  currentTrace.value?.producedMessageId
    ? findMessage(currentTrace.value.producedMessageId)
    : null,
);
const triggeringMessages = computed(() =>
  currentTrace.value
    ? currentTrace.value.triggeringMessageIds
        .map((messageId) => findMessage(messageId))
        .filter((message): message is ChatMessage => Boolean(message))
    : [],
);
const visibleContextMessages = computed(() =>
  currentTrace.value
    ? currentTrace.value.visibleMessageIds
        .map((messageId) => findMessage(messageId))
        .filter((message): message is ChatMessage => Boolean(message))
    : [],
);
const causalityMessages = computed(() =>
  isMessageTarget.value
    ? [
        ...(messageGraph.value?.relatedMessages ?? []),
        ...(currentMessage.value ? [currentMessage.value] : []),
      ]
    : currentTrace.value
      ? inspection.relatedMessagesForTrace(currentTrace.value)
      : [],
);
const causalitySourceMessages = computed(() =>
  isMessageTarget.value && currentMessage.value
    ? [currentMessage.value]
    : triggeringMessages.value,
);
const downstreamTraceCards = computed(() =>
  isMessageTarget.value
    ? (messageGraph.value?.downstreamTraces ?? [])
    : currentTrace.value
      ? currentTrace.value.childTraceIds
          .map((traceId) => chat.getRequestTrace(traceId))
          .filter((trace): trace is RequestTrace => Boolean(trace))
      : [],
);
const downstreamMessages = computed(() =>
  isMessageTarget.value
    ? []
    : currentTrace.value
      ? currentTrace.value.downstreamMessageIds
          .map((messageId) => findMessage(messageId))
          .filter((message): message is ChatMessage => Boolean(message))
      : [],
);
const relatedTraceCards = computed(() =>
  isMessageTarget.value
    ? (messageGraph.value?.downstreamTraces ?? [])
    : inspection.relatedTraces.value,
);
const fallbackOrErrorTraces = computed(() =>
  relatedTraceCards.value.filter(
    (trace) =>
      trace.fallback || trace.status === 'failed' || trace.status === 'aborted',
  ),
);
const currentSubjectLabel = computed(() => {
  if (ui.inspectionTargetType === 'trace') {
    return 'Request trace';
  }

  if (!currentMessage.value) {
    return 'Request inspection';
  }

  return currentMessage.value.senderId === 'human'
    ? 'Human message'
    : 'Agent message';
});
const currentSubjectTitle = computed(() => {
  if (ui.inspectionTargetType === 'trace') {
    return currentTrace.value
      ? `${currentTrace.value.agentName} · ${currentTrace.value.mode}`
      : 'Trace not found';
  }

  return currentMessage.value
    ? formatMessageCard(currentMessage.value)
    : 'Message not found';
});
const currentSubjectMeta = computed(() => {
  if (ui.inspectionTargetType === 'trace' && currentTrace.value) {
    return [
      currentTrace.value.status,
      `sweep ${currentTrace.value.sweep}`,
      currentTrace.value.transport?.modelId,
      tokenSummary.value,
      costSummary.value,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  if (!currentMessage.value) {
    return 'No message selected.';
  }

  return [
    formatMessageTime(currentMessage.value.createdAt),
    currentMessage.value.target,
    currentMessage.value.sourceTraceId
      ? `trace ${currentMessage.value.sourceTraceId}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
});
const overviewText = computed(() => {
  if (isMessageTarget.value && currentMessage.value) {
    const triggered = messageGraph.value?.triggeringTraces.length ?? 0;
    const visibleOnly = messageGraph.value?.visibleOnlyTraces.length ?? 0;
    return `Message "${trimPreview(currentMessage.value.content)}" triggered ${triggered} trace(s) directly and appeared as passive context in ${visibleOnly} more.`;
  }

  if (currentTrace.value) {
    if (currentAction.value?.type === 'stay_silent') {
      return `${currentTrace.value.agentName} ran in ${currentTrace.value.mode} mode and stayed silent: ${currentAction.value.reason}.`;
    }

    const outcome = producedMessage.value
      ? `produced ${formatMessageCard(producedMessage.value)}`
      : currentTrace.value.status === 'succeeded'
        ? 'completed without a message'
        : (currentTrace.value.transport?.error ?? currentTrace.value.status);
    return `${currentTrace.value.agentName} ran in ${currentTrace.value.mode} mode and ${outcome}.`;
  }

  return 'Nothing selected.';
});
const outputSummary = computed(() => {
  if (!currentTrace.value) {
    return 'No trace selected.';
  }

  if (currentAction.value?.type === 'stay_silent') {
    return `Silent decision with reason: ${currentAction.value.reason}`;
  }

  if (producedMessage.value) {
    return `Produced message: ${trimPreview(producedMessage.value.content)}`;
  }

  return 'No output message.';
});
const tokenSummary = computed(() => {
  if (!currentTrace.value?.usage) {
    return 'n/a';
  }

  const usage = currentTrace.value.usage;
  return `${usage.promptTokens ?? 0}/${usage.completionTokens ?? 0}/${usage.totalTokens ?? 0}`;
});
const costSummary = computed(() => {
  if (!currentTrace.value?.usage) {
    return 'n/a';
  }

  return formatMessageCost(
    currentTrace.value.usage.requestCostUsd ??
      currentTrace.value.usage.estimatedCost ??
      0,
  );
});
const rawJsonText = computed(() =>
  formatJson({
    request: currentTrace.value?.payloads.requestInputJson,
    response: currentTrace.value?.payloads.responseOutputJson,
    normalized: currentTrace.value?.payloads.normalizedActionJson,
  }),
);

function findMessage(messageId: string): ChatMessage | null {
  for (const entry of state.value.timeline) {
    if (entry.kind === 'message' && entry.message.id === messageId) {
      return entry.message;
    }
  }

  return null;
}

function participantName(participantId: string): string {
  return inspection.participantName(participantId);
}

function formatMessageCard(message: ChatMessage): string {
  return `${formatMessageTime(message.createdAt)} ${formatMessageAuthor(message, { byId: participantName })} ${trimPreview(message.content)}`;
}

function formatTraceCard(trace: RequestTrace): string {
  return `${trace.agentName} · ${trace.mode}${trace.fallback ? ' fallback' : ''} · ${trace.status}`;
}

function trimPreview(text: string): string {
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

async function copyRawJson() {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard?.writeText) {
    return;
  }

  await clipboard.writeText(rawJsonText.value);
}
</script>

<style scoped>
@reference "../../styles.css";

.inspection-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/30 p-4 backdrop-blur-sm;
}

.inspection-card {
  @apply grid h-[min(90vh,52rem)] w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-neutral-300 bg-white shadow-xl;
}

.inspection-header {
  @apply flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4;
}

.inspection-header-copy {
  @apply min-w-0;
}

.inspection-kicker {
  @apply m-0 text-[11px] uppercase tracking-[0.08em] text-neutral-500;
}

.inspection-title {
  @apply mt-1 text-base font-semibold text-neutral-900;
}

.inspection-meta {
  @apply mt-1 text-[12px] text-neutral-600;
}

.inspection-body {
  @apply grid min-h-0 grid-cols-[17rem_minmax(0,1fr)];
}

.inspection-rail {
  @apply min-h-0 overflow-auto border-r border-neutral-200 bg-neutral-50 p-3;
}

.inspection-main {
  @apply grid min-h-0 grid-rows-[auto_minmax(0,1fr)];
}

.inspection-rail-group {
  @apply mb-4 grid gap-2;
}

.inspection-rail-title,
.inspection-section-title {
  @apply text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500;
}

.inspection-link-card,
.inspection-chip {
  @apply w-full rounded border border-neutral-200 bg-white px-3 py-2 text-left text-[12px] leading-5 text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50;
}

.inspection-empty,
.inspection-list-heading {
  @apply text-[12px] text-neutral-500;
}

.inspection-tabs {
  @apply flex flex-wrap gap-2 border-b border-neutral-200 px-4 py-3;
}

.inspection-tab {
  @apply rounded border border-neutral-200 bg-white px-3 py-1 text-[12px] text-neutral-700;
}

.inspection-tab-active {
  @apply border-neutral-900 bg-neutral-900 text-white;
}

.inspection-panel {
  @apply min-h-0 overflow-auto p-4;
}

.inspection-summary {
  @apply text-[13px] leading-6 text-neutral-800;
}

.inspection-block {
  @apply mt-4 grid gap-2;
}

.inspection-chip-list {
  @apply grid gap-2;
}

.inspection-grid {
  @apply grid grid-cols-2 gap-3 text-[12px];
}

.inspection-grid dt {
  @apply text-neutral-500;
}

.inspection-grid dd {
  @apply m-0 text-neutral-900;
}

.inspection-json-actions {
  @apply mb-3 flex justify-end;
}

.inspection-json {
  @apply m-0 overflow-auto rounded border border-neutral-200 bg-neutral-950 px-3 py-3 text-[11px] leading-5 text-neutral-100;
}

@media (max-width: 900px) {
  .inspection-card {
    @apply h-[95vh];
  }

  .inspection-body {
    @apply grid-cols-1 grid-rows-[12rem_minmax(0,1fr)];
  }

  .inspection-rail {
    @apply border-r-0 border-b border-neutral-200;
  }
}
</style>
