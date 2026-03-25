<template>
  <section class="participants-column">
    <header class="participants-header">
      <h2 class="participants-title">Participants</h2>
      <UiButton
        class="participants-add-button"
        size="sm"
        aria-label="Add participant"
        @click="openCreateAgentWizard"
      >
        Add
      </UiButton>
    </header>

    <ul class="participants-list">
      <li
        v-for="participant in participantRows"
        :key="participant.id"
        class="participant-row"
        @dblclick="messageInput.mentionParticipantById(participant.id)"
      >
        <div class="participant-copy">
          <span class="participant-heading">
            <span class="participant-name">{{ participant.name }}</span>
            <span
              v-if="participant.showMoney"
              class="participant-price-trigger"
              @mouseenter="
                overlayControls.openModelPriceBubble(participant.id, $event)
              "
              @mouseleave="overlayControls.scheduleModelPriceBubbleClose()"
              >{{ participant.spentSummary }}</span
            >
          </span>
          <span class="participant-role">{{ participant.subtitle }}</span>
        </div>
        <div class="participant-actions">
          <UiButton
            class="participant-edit-button"
            size="sm"
            @click="openParticipantEditor(participant.id)"
          >
            Edit
          </UiButton>
        </div>
      </li>
    </ul>
    <ModelBrowserDialog
      v-if="showModelBrowser"
      @select="onModelSelected"
      @close="onBrowserClosed"
    />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import ModelBrowserDialog from '../models/ModelBrowserDialog.vue';
import { useAgentsStore } from '../../stores/agents';
import { useMessageInputStore } from '../../stores/messageInput';
import { useParticipantsStore } from '../../stores/participants';
import { useUiStore } from '../../stores/ui';
import { useOverlayControls } from '../../useOverlayControls';
import UiButton from '../ui/UiButton.vue';

const { participantRows } = storeToRefs(useParticipantsStore());
const ui = useUiStore();
const { isApiKeyPresent } = storeToRefs(useAgentsStore());
const messageInput = useMessageInputStore();
const overlayControls = useOverlayControls();

const showModelBrowser = ref(false);

function openCreateAgentWizard() {
  ui.editingAgentId = null;
  if (!isApiKeyPresent.value) {
    ui.showAgentWizard = true;
    return;
  }
  showModelBrowser.value = true;
}

function onModelSelected(modelId: string) {
  showModelBrowser.value = false;
  ui.preselectedModelId = modelId;
  ui.showAgentWizard = true;
}

function onBrowserClosed() {
  showModelBrowser.value = false;
}

function openParticipantEditor(participantId: string) {
  const participant = participantRows.value.find(
    (item) => item.id === participantId,
  );
  if (!participant) {
    return;
  }

  if (participant.role === 'agent') {
    ui.editingAgentId = participant.id;
    ui.showAgentWizard = true;
    return;
  }

  ui.showHumanNameModal = true;
}
</script>

<style scoped>
@reference "../../../styles.css";

.participants-column {
  @apply grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-br-md border-y border-r border-frame-border bg-white;
  border-top-width: 0;
  border-bottom-left-radius: 0;
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

.participant-row:hover .participant-actions {
  @apply pointer-events-auto opacity-100;
}
</style>
