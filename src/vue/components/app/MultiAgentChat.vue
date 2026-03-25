<template>
  <div class="playground-shell">
    <div class="playground-layout">
      <div class="playground-tabs-row">
        <ChatTabs />
      </div>

      <div class="playground-toolbar-row">
        <ChatToolbar />
      </div>

      <ConversationPanel />

      <aside class="sidebar-column">
        <ParticipantsPanel />
      </aside>

      <LogsPanel class="layout-logs-panel" />
    </div>

    <SettingsDialog />
    <HumanNameDialog />
    <AgentWizard />
    <DeleteAgentDialog />
    <RequestInspectionDialog />
    <ChatOverlays />
  </div>
</template>

<script setup lang="ts">
import ChatTabs from '../conversation/ChatTabs.vue';
import ChatToolbar from '../conversation/ChatToolbar.vue';
import ConversationPanel from '../conversation/ConversationPanel.vue';
import ChatOverlays from './ChatOverlays.vue';
import RequestInspectionDialog from '../inspection/RequestInspectionDialog.vue';
import AgentWizard from '../participants/AgentWizard.vue';
import DeleteAgentDialog from '../participants/DeleteAgentDialog.vue';
import HumanNameDialog from '../participants/HumanNameDialog.vue';
import ParticipantsPanel from '../participants/ParticipantsPanel.vue';
import LogsPanel from '../panels/LogsPanel.vue';
import SettingsDialog from '../settings/SettingsDialog.vue';
</script>

<style scoped>
@reference "../../../styles.css";

.playground-shell {
  @apply relative isolate h-full min-h-0 overflow-hidden bg-neutral-100 p-2 font-mono text-[13px] text-neutral-900;
}

.playground-layout {
  @apply grid min-h-0 grid-cols-[1fr_17rem] grid-rows-[auto_auto_1fr_auto] gap-x-0 gap-y-0;
  height: 100%;
}

.playground-tabs-row {
  @apply col-span-2 w-full;
}

.playground-toolbar-row {
  @apply col-span-2 w-full overflow-hidden rounded-tr-md border-x border-b border-frame-border bg-toolbar-surface;
}

.sidebar-column {
  @apply grid h-full min-h-0;
}

.layout-logs-panel {
  @apply mt-2;
}
</style>
