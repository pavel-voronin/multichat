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
          <div class="inspection-nav">
            <button
              class="inspection-nav-btn"
              :disabled="!inspection.canGoBack"
              aria-label="Back"
              @click="inspection.navigateBack"
            >
              ←
            </button>
            <button
              class="inspection-nav-btn"
              :disabled="!inspection.canGoForward"
              aria-label="Forward"
              @click="inspection.navigateForward"
            >
              →
            </button>
          </div>
          <div class="inspection-subject">
            <span class="inspection-author">{{ authorLabel }}</span>
            <span class="inspection-sep"> · </span>
            <span class="inspection-time">{{ timeLabel }}</span>
            <template v-if="actionTypeLabel">
              <span class="inspection-sep"> · </span>
              <span class="inspection-action">{{ actionTypeLabel }}</span>
            </template>
          </div>
          <span v-if="costLabel" class="inspection-cost">{{ costLabel }}</span>
          <button
            class="inspection-close"
            aria-label="Close"
            @click="inspection.close"
          >
            ✕
          </button>
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

        <!-- Tab: Agent -->
        <section
          v-if="ui.activeInspectionTab === 'agent'"
          class="inspection-panel"
        >
          <div class="inspection-block">
            <p class="inspection-field-label">Agent</p>
            <p class="inspection-field-value">{{ agentNameLabel }}</p>
          </div>
          <div class="inspection-block">
            <p class="inspection-field-label">Model</p>
            <p class="inspection-field-value">{{ modelLabel }}</p>
          </div>
          <div class="inspection-block">
            <p class="inspection-field-label">Provider</p>
            <p class="inspection-field-value">{{ providerLabel }}</p>
          </div>
          <div class="inspection-block">
            <p class="inspection-field-label">Context length</p>
            <p class="inspection-field-value">{{ contextLengthLabel }}</p>
          </div>
          <div class="inspection-block">
            <p class="inspection-field-label">System prompt</p>
            <pre
              v-if="agent"
              class="inspection-prompt"
            >{{ agent.systemPrompt }}</pre>
            <p v-else class="inspection-na">—</p>
          </div>
        </section>

        <!-- Tab: Request -->
        <section
          v-else-if="ui.activeInspectionTab === 'request'"
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

        <!-- Tab: Result -->
        <section
          v-else-if="ui.activeInspectionTab === 'result'"
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
            <!-- Raw JSON accordion -->
            <details class="inspection-raw-json">
              <summary class="inspection-raw-json-summary">
                Raw JSON
                <button
                  type="button"
                  class="inspection-copy-btn"
                  @click.prevent="copyRawJson"
                >
                  Copy
                </button>
              </summary>
              <div class="inspection-raw-json-body">
                <p class="inspection-field-label">Request input</p>
                <pre class="inspection-json">{{ formatJson(trace.payloads.requestInputJson) }}</pre>
                <p class="inspection-field-label">Response output</p>
                <pre class="inspection-json">{{ formatJson(trace.payloads.responseOutputJson) }}</pre>
                <p class="inspection-field-label">Normalized action</p>
                <pre class="inspection-json">{{ formatJson(trace.payloads.normalizedActionJson) }}</pre>
              </div>
            </details>
          </template>
          <p v-else class="inspection-na">No request data.</p>
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

const tabs = [
  { id: 'agent' as const, label: 'Agent' },
  { id: 'request' as const, label: 'Request' },
  { id: 'result' as const, label: 'Result' },
];

const inspection = useInspectionStore();
const ui = useUiStore();
const {
  currentInspectedMessage: message,
  traceForCurrentMessage: trace,
  agentForCurrentMessage: agent,
  currentActionForTrace: action,
} = storeToRefs(inspection);

const authorLabel = computed(() => {
  if (!message.value) return '—';
  return formatMessageAuthor(message.value, {
    byId: inspection.participantName,
  });
});

const timeLabel = computed(() =>
  message.value ? formatMessageTime(message.value.createdAt) : '—',
);

const actionTypeLabel = computed(() => {
  if (!action.value) return null;
  return action.value.type;
});

const costLabel = computed(() => {
  const cost = trace.value?.usage?.requestCostUsd;
  if (cost == null) return null;
  return formatMessageCost(cost);
});

// Agent tab
const agentNameLabel = computed(() => agent.value?.name ?? 'Human');
const modelLabel = computed(() => agent.value?.modelId ?? '—');
const providerLabel = computed(
  () => trace.value?.transport?.provider ?? '—',
);
const contextLengthLabel = computed(() => {
  const len = agent.value?.modelSnapshot?.contextLength;
  return len != null ? `${(len / 1000).toFixed(0)}k` : '—';
});

// Request tab
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

// Result tab
const actionDetailLabel = computed(() => {
  if (!action.value) return '—';
  switch (action.value.type) {
    case 'speak_public':
      return 'Published to public chat';
    case 'send_private':
      return `Sent privately to ${inspection.participantName(action.value.to)}`;
    case 'stay_silent':
      return `Stayed silent: ${action.value.reason}`;
  }
});
const completionTokensLabel = computed(
  () => trace.value?.usage?.completionTokens?.toString() ?? '—',
);

const rawJsonText = computed(() =>
  JSON.stringify(
    {
      request: trace.value?.payloads.requestInputJson,
      response: trace.value?.payloads.responseOutputJson,
      normalized: trace.value?.payloads.normalizedActionJson,
    },
    null,
    2,
  ),
);

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

async function copyRawJson(): Promise<void> {
  await globalThis.navigator?.clipboard?.writeText(rawJsonText.value);
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
  @apply flex items-center gap-3 border-b border-neutral-200 px-4 py-3;
}

.inspection-nav {
  @apply flex gap-1 shrink-0;
}

.inspection-nav-btn {
  @apply flex h-6 w-6 items-center justify-center rounded text-[13px] text-neutral-500 transition hover:bg-neutral-100 disabled:cursor-default disabled:opacity-30;
}

.inspection-subject {
  @apply flex min-w-0 flex-1 flex-wrap items-center gap-x-1 text-[13px];
}

.inspection-author {
  @apply font-semibold text-neutral-900;
}

.inspection-sep {
  @apply text-neutral-400;
}

.inspection-time {
  @apply text-neutral-500;
}

.inspection-action {
  @apply rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700;
}

.inspection-cost {
  @apply shrink-0 text-[12px] text-neutral-500;
}

.inspection-close {
  @apply flex h-7 w-7 shrink-0 items-center justify-center rounded text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700;
}

.inspection-tabs {
  @apply flex gap-1 border-b border-neutral-200 px-4 py-2;
}

.inspection-tab {
  @apply rounded border border-neutral-200 bg-white px-3 py-1 text-[12px] text-neutral-700 transition hover:bg-neutral-50;
}

.inspection-tab-active {
  @apply border-neutral-900 bg-neutral-900 text-white;
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

.inspection-prompt {
  @apply m-0 max-h-48 overflow-auto rounded border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[11px] leading-5 text-neutral-700;
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

.inspection-raw-json-summary {
  @apply flex cursor-pointer items-center justify-between px-3 py-2 text-[12px] font-semibold text-neutral-700 hover:bg-neutral-50;
}

.inspection-copy-btn {
  @apply rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-50;
}

.inspection-raw-json-body {
  @apply border-t border-neutral-200 p-3;
}

.inspection-json {
  @apply m-0 mb-4 overflow-auto rounded bg-neutral-950 px-3 py-2 text-[11px] leading-5 text-neutral-100;
}
</style>
