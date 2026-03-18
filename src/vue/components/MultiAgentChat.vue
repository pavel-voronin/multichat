<template>
  <div class="playground-shell">
    <div class="playground-layout">
      <div class="playground-toolbar-row">
        <ChatToolbar />
      </div>

      <ConversationPanel />

      <aside class="sidebar-column">
        <ParticipantsPanel />
      </aside>

      <LogsPanel class="layout-logs-panel" />
    </div>

    <SettingsModal />
    <HumanNameModal />
    <AgentWizard />
    <DeleteAgentModal />
    <RequestInspectionModal />
    <ChatOverlays />
  </div>
</template>

<script setup lang="ts">
import AgentWizard from './AgentWizard.vue';
import ChatOverlays from './ChatOverlays.vue';
import ChatToolbar from './ChatToolbar.vue';
import ConversationPanel from './ConversationPanel.vue';
import DeleteAgentModal from './DeleteAgentModal.vue';
import HumanNameModal from './HumanNameModal.vue';
import LogsPanel from './LogsPanel.vue';
import ParticipantsPanel from './ParticipantsPanel.vue';
import RequestInspectionModal from './RequestInspectionModal.vue';
import SettingsModal from './SettingsModal.vue';
</script>

<style scoped>
@reference "../../styles.css";

.playground-shell {
  @apply relative isolate h-full min-h-0 overflow-hidden bg-neutral-100 p-2 font-mono text-[13px] text-neutral-900;
}

.playground-layout {
  @apply grid min-h-0 grid-cols-[1fr_17rem] grid-rows-[auto_1fr_auto] gap-2;
  height: 100%;
}

.playground-toolbar-row {
  @apply col-span-2 w-full;
}

.sidebar-column {
  @apply grid h-full min-h-0;
}
</style>
