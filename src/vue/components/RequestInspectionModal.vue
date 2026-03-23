<template>
  <Teleport to="body">
    <div
      v-if="ui.showRequestInspection"
      class="inspection-backdrop"
      @click.self="inspection.close"
    >
      <div class="inspection-card">
        <!-- Header -->
        <header class="inspection-header">
          <div class="inspection-subject">
            <span class="inspection-time">{{ timeLabel }}</span>
            <span class="inspection-sep"> </span>
            <span class="inspection-author">{{ authorLabel }}</span>
            <template v-if="costLabel">
              <span class="inspection-sep"> </span>
              <span class="inspection-cost">{{ costLabel }}</span>
            </template>
            <span class="inspection-sep"> </span>
            <span class="inspection-msg">{{ messageContentLabel }}</span>
          </div>
          <div class="inspection-nav">
            <button
              class="inspection-nav-btn"
              :disabled="!inspection.canGoBack"
              aria-label="Back"
              @click="inspection.navigateBack"
            >←</button>
            <button
              class="inspection-nav-btn"
              :disabled="!inspection.canGoForward"
              aria-label="Forward"
              @click="inspection.navigateForward"
            >→</button>
          </div>
          <button
            class="inspection-close"
            aria-label="Close"
            @click="inspection.close"
          >✕</button>
        </header>

        <!-- Tab bar -->
        <nav class="inspection-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="inspection-tab"
            :class="{ 'inspection-tab-active': ui.activeInspectionTab === tab.id }"
            @click="ui.activeInspectionTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </nav>

        <!-- Tab: Participant -->
        <section
          v-if="ui.activeInspectionTab === 'participant'"
          class="inspection-panel"
        >
          <template v-if="agent">
            <p class="inspection-field-label">{{ agentNameLabel }}</p>
            <ModelCard
              :model-id="modelId"
              :snapshot="modelSnapshot"
              :readonly="true"
              class="mb-4"
            />
          </template>
          <p v-else class="inspection-field-label mb-4">Human</p>

          <div class="inspection-prompt-block">
            <p class="inspection-field-label">Agent Prompt</p>
            <pre v-if="agentPrompt" class="inspection-prompt">{{ agentPrompt }}</pre>
            <p v-else class="inspection-na">—</p>
          </div>

          <div class="inspection-prompt-block">
            <p class="inspection-field-label">Full System Prompt (sent)</p>
            <pre v-if="fullSystemPrompt" class="inspection-prompt">{{ fullSystemPrompt }}</pre>
            <p v-else class="inspection-na">—</p>
          </div>
        </section>

        <!-- Tab: Input -->
        <section
          v-else-if="ui.activeInspectionTab === 'input'"
          class="inspection-panel"
        >
          <template v-if="trace">
            <div class="inspection-block">
              <p class="inspection-field-label">Context</p>
              <div class="inspection-message-list">
                <InspectorMessageLine
                  v-for="msg in inspection.contextMessagesForCurrentTrace"
                  :key="msg.id"
                  :message="msg"
                />
                <p
                  v-if="!inspection.contextMessagesForCurrentTrace.length"
                  class="inspection-na"
                >
                  No context messages.
                </p>
              </div>
            </div>
            <div class="inspection-meta-grid">
              <div>
                <p class="inspection-field-label">Started</p>
                <p class="inspection-field-value">{{ startedAtLabel }}</p>
              </div>
              <div>
                <p class="inspection-field-label">Duration</p>
                <p class="inspection-field-value">{{ durationLabel }}</p>
              </div>
              <div>
                <p class="inspection-field-label">Input tokens</p>
                <p class="inspection-field-value">{{ promptTokensLabel }}</p>
              </div>
            </div>
          </template>
          <p v-else class="inspection-na">No request data.</p>
        </section>

        <!-- Tab: Output -->
        <section
          v-else-if="ui.activeInspectionTab === 'output'"
          class="inspection-panel"
        >
          <template v-if="trace">
            <div class="inspection-block">
              <p class="inspection-field-label">Action</p>
              <p class="inspection-field-value">{{ actionDetailLabel }}</p>
            </div>
            <div class="inspection-meta-grid">
              <div>
                <p class="inspection-field-label">Output tokens</p>
                <p class="inspection-field-value">{{ completionTokensLabel }}</p>
              </div>
              <div>
                <p class="inspection-field-label">Cost</p>
                <p class="inspection-field-value">{{ costLabel ?? '—' }}</p>
              </div>
              <div>
                <p class="inspection-field-label">Duration</p>
                <p class="inspection-field-value">{{ durationLabel }}</p>
              </div>
            </div>

            <details class="inspection-raw-json">
              <summary class="inspection-raw-json-summary">
                Request Input
                <button type="button" class="inspection-copy-btn" @click.prevent="copyJson(trace?.payloads.requestInputJson)">Copy</button>
              </summary>
              <pre class="inspection-json">{{ formatJson(trace.payloads.requestInputJson) }}</pre>
            </details>

            <details class="inspection-raw-json inspection-raw-json-second">
              <summary class="inspection-raw-json-summary">
                Response Output
                <button type="button" class="inspection-copy-btn" @click.prevent="copyJson(trace?.payloads.responseOutputJson)">Copy</button>
              </summary>
              <pre class="inspection-json">{{ formatJson(trace.payloads.responseOutputJson) }}</pre>
            </details>
          </template>
          <p v-else class="inspection-na">No request data.</p>
        </section>

        <!-- Tab: Used In -->
        <section
          v-else-if="ui.activeInspectionTab === 'used-in'"
          class="inspection-panel"
        >
          <div class="inspection-message-list">
            <InspectorMessageLine
              v-for="msg in usedInMessages"
              :key="msg.id"
              :message="msg"
            />
            <p v-if="!usedInMessages.length" class="inspection-na">
              No messages used this in their context.
            </p>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useInspectionStore } from '../stores/inspection';
import { useUiStore } from '../stores/ui';
import {
  formatMessageAuthor,
  formatMessageTime,
} from '../utils/chatFormatting';
import { formatMessageCost } from '../utils/costing';
import InspectorMessageLine from './timeline/InspectorMessageLine.vue';
import ModelCard from './ModelCard.vue';

const tabs = [
  { id: 'participant' as const, label: 'Participant' },
  { id: 'input' as const, label: 'Input' },
  { id: 'output' as const, label: 'Output' },
  { id: 'used-in' as const, label: 'Used In' },
];

const inspection = useInspectionStore();
const ui = useUiStore();
const {
  currentInspectedMessage: message,
  traceForCurrentMessage: trace,
  agentForCurrentMessage: agent,
  currentActionForTrace: action,
  usedInMessagesForCurrentMessage: usedInMessages,
} = storeToRefs(inspection);

// Header
const timeLabel = computed(() =>
  message.value ? formatMessageTime(message.value.createdAt) : '—',
);
const authorLabel = computed(() => {
  if (!message.value) return '—';
  return formatMessageAuthor(message.value, { byId: inspection.participantName });
});
const costLabel = computed(() => {
  const cost = trace.value?.usage?.requestCostUsd;
  if (cost == null) return null;
  return formatMessageCost(cost);
});
const messageContentLabel = computed(() => message.value?.content ?? '');

// Participant tab
const agentNameLabel = computed(() => agent.value?.name ?? 'Human');
const modelId = computed(() => agent.value?.modelId ?? '');
const modelSnapshot = computed(() => agent.value?.modelSnapshot);
const agentPrompt = computed(() => agent.value?.systemPrompt ?? null);
const fullSystemPrompt = computed<string | null>(() => {
  const json = trace.value?.payloads.requestInputJson;
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const messages = (json as { messages?: Array<{ role: string; content: unknown }> }).messages;
  const entry = messages?.find((m) => m.role === 'system');
  return typeof entry?.content === 'string' ? entry.content : null;
});

// Input tab
const startedAtLabel = computed(() =>
  trace.value ? formatMessageTime(trace.value.startedAt) : '—',
);
const durationLabel = computed(() => {
  if (!trace.value?.finishedAt) return '—';
  const ms =
    new Date(trace.value.finishedAt).getTime() -
    new Date(trace.value.startedAt).getTime();
  return `${(ms / 1000).toFixed(1)} s`;
});
const promptTokensLabel = computed(
  () => trace.value?.usage?.promptTokens?.toString() ?? '—',
);

// Output tab
const actionDetailLabel = computed((): string => {
  if (!action.value) return '—';
  switch (action.value.type) {
    case 'speak_public': return 'Published to public chat';
    case 'send_private': return `Sent privately to ${inspection.participantName(action.value.to)}`;
    case 'stay_silent': return `Stayed silent: ${action.value.reason}`;
  }
});
const completionTokensLabel = computed(
  () => trace.value?.usage?.completionTokens?.toString() ?? '—',
);

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

async function copyJson(value: unknown): Promise<void> {
  await globalThis.navigator?.clipboard?.writeText(formatJson(value));
}
</script>

<style scoped>
@reference "../../styles.css";

.inspection-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/30 p-4 backdrop-blur-sm;
}

.inspection-card {
  @apply grid h-[min(90vh,48rem)] w-full max-w-2xl grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-md border border-neutral-300 bg-white shadow-xl;
}

.inspection-header {
  @apply flex items-center gap-2 border-b border-neutral-200 px-4 py-3;
}

.inspection-subject {
  @apply flex min-w-0 flex-1 items-center overflow-hidden text-[13px] whitespace-nowrap;
}

.inspection-time {
  @apply shrink-0 text-neutral-500;
}

.inspection-sep {
  @apply shrink-0 whitespace-pre text-neutral-400;
}

.inspection-author {
  @apply shrink-0 font-semibold text-neutral-900;
}

.inspection-cost {
  @apply shrink-0 text-emerald-700;
}

.inspection-msg {
  @apply min-w-0 truncate text-neutral-600;
}

.inspection-nav {
  @apply flex shrink-0 gap-1;
}

.inspection-nav-btn {
  @apply flex h-6 w-6 items-center justify-center rounded text-[13px] text-neutral-500 transition hover:bg-neutral-100 disabled:cursor-default disabled:opacity-30;
}

.inspection-close {
  @apply ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}

.inspection-tabs {
  @apply flex gap-1 border-b border-neutral-200 px-4 py-2;
}

.inspection-tab {
  @apply rounded border border-neutral-200 bg-white px-3 py-1 text-[12px] text-neutral-700 transition hover:bg-neutral-50;
}

.inspection-tab-active {
  @apply border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800;
}

.inspection-panel {
  @apply min-h-0 overflow-auto p-4;
}

.inspection-block {
  @apply mb-4;
}

.inspection-field-label {
  @apply mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500;
}

.inspection-field-value {
  @apply text-[13px] text-neutral-900;
}

.inspection-na {
  @apply text-[13px] text-neutral-400;
}

.inspection-prompt-block {
  @apply mb-4 flex flex-col;
}

.inspection-prompt {
  @apply m-0 flex-1 overflow-auto rounded border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[11px] leading-5 text-neutral-700;
}

.inspection-message-list {
  @apply grid gap-0.5;
}

.inspection-meta-grid {
  @apply grid grid-cols-3 gap-3;
}

.inspection-raw-json {
  @apply mt-6 rounded border border-neutral-200;
}

.inspection-raw-json-second {
  @apply mt-2;
}

.inspection-raw-json-summary {
  @apply flex cursor-pointer items-center justify-between px-3 py-2 text-[12px] font-semibold text-neutral-700 hover:bg-neutral-50;
}

.inspection-copy-btn {
  @apply rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-50;
}

.inspection-json {
  @apply m-0 overflow-auto rounded-b bg-neutral-950 px-3 py-2 text-[11px] leading-5 text-neutral-100;
}
</style>
