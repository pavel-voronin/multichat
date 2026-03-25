<template>
  <section class="chat-tabs">
    <div class="chat-tabs-rail" @click="handleRailClick">
      <div class="chat-tabs-primary" @click="handleRailClick" @dblclick="createTab">
        <div class="chat-tabs-track">
          <div class="chat-tabs-list" :style="tabListStyle">
            <div
              v-for="tab in renderedTabs"
              :key="tab.id"
              class="chat-tab"
              :class="{
                'chat-tab-active': tab.isActive,
                'chat-tab-dragging': draggingTabId === tab.id,
              }"
              draggable="true"
              @click="activateTab(tab.id)"
              @dblclick.stop
              @dragstart="handleDragStart(tab.id, $event)"
              @dragover.prevent="handleDragOver(tab.id)"
              @drop.prevent="handleDrop(tab.id, $event)"
              @dragend="handleDragEnd"
            >
              <template v-if="editingTabId === tab.id">
                <div class="chat-tab-edit" @click.stop>
                  <input
                    :ref="(element) => setEditInputRef(tab.id, element)"
                    v-model="editingTitle"
                    class="chat-tab-input"
                    type="text"
                    spellcheck="false"
                    @keydown.enter.prevent="commitRename(tab)"
                    @keydown.esc.prevent="cancelRename"
                  />
                  <button
                    type="button"
                    class="chat-tab-save"
                    @click="commitRename(tab)"
                  >
                    Save
                  </button>
                </div>
              </template>

              <template v-else>
                <button type="button" class="chat-tab-main">
                  <span class="chat-tab-title" @dblclick.stop="startRename(tab)">{{
                    tab.header.title
                  }}</span>
                  <span v-if="tab.header.badge !== null" class="chat-tab-badge">{{
                    tab.header.badge
                  }}</span>
                </button>
                <div class="chat-tab-actions" @click.stop>
                  <button
                    type="button"
                    class="chat-tab-close"
                    aria-label="Close tab"
                    @click="closeTab(tab.id)"
                  >
                    &times;
                  </button>
                </div>
              </template>
            </div>
          </div>
          <button
            type="button"
            class="chat-tabs-add"
            aria-label="Add tab"
            @dblclick.stop
            @click.stop="createTab"
          >
            <span class="chat-tabs-add-label">+</span>
          </button>
        </div>
        <div
          class="chat-tabs-empty-zone"
          @click.stop="handleRailClick"
          @dblclick.stop="createTab"
        />
      </div>

      <div class="chat-tabs-secondary">
        <slot name="right-controls" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { RenderedTab } from '../../types';
import { useInspectionStore } from '../../stores/inspection';
import { useTabsStore } from '../../stores/tabs';
import { useUiStore } from '../../stores/ui';

type EditableInput = HTMLInputElement | null;

const tabsStore = useTabsStore();
const { workspace, renderedTabs } = storeToRefs(tabsStore);
const ui = useUiStore();
const inspection = useInspectionStore();
const editingTabId = ref<string | null>(null);
const editingTitle = ref('');
const draggingTabId = ref<string | null>(null);
const editInputRefs = new Map<string, EditableInput>();
const tabListStyle = computed(() => ({
  width: `calc(${Math.max(renderedTabs.value.length, 1)} * var(--chat-tab-max-width))`,
}));

function createTab() {
  cancelRename();
  const tab = tabsStore.createTab({ activate: true });
  ui.resetChatScopedState();
  inspection.reset();
  void nextTick(() => {
    const createdTab = renderedTabs.value.find((item) => item.id === tab.id);
    if (createdTab) {
      startRename(createdTab);
    }
  });
}

function activateTab(tabId: string) {
  if (workspace.value.activeTabId === tabId) {
    return;
  }

  cancelRename();
  tabsStore.activateTab(tabId);
  ui.resetChatScopedState();
  inspection.reset();
}

function startRename(tab: RenderedTab) {
  editingTabId.value = tab.id;
  editingTitle.value = tab.title;
  void nextTick(() => {
    editInputRefs.get(tab.id)?.focus();
    editInputRefs.get(tab.id)?.select();
  });
}

function commitRename(tab: RenderedTab) {
  tabsStore.renameTab(tab.id, editingTitle.value);
  cancelRename();
}

function cancelRename() {
  editingTabId.value = null;
  editingTitle.value = '';
}

function handleRailClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    cancelRename();
    return;
  }

  if (!target.closest('.chat-tab-edit')) {
    cancelRename();
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!editingTabId.value) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    cancelRename();
    return;
  }

  if (target.closest('.chat-tab-edit')) {
    return;
  }

  const activeTab = renderedTabs.value.find(
    (tab) => tab.id === editingTabId.value,
  );
  if (activeTab) {
    commitRename(activeTab);
    return;
  }

  cancelRename();
}

function closeTab(tabId: string) {
  cancelRename();
  tabsStore.closeTab(tabId);
  ui.resetChatScopedState();
  inspection.reset();
}

function handleDragStart(tabId: string, event: DragEvent) {
  draggingTabId.value = tabId;
  event.dataTransfer?.setData('text/plain', tabId);
  event.dataTransfer?.setDragImage(event.currentTarget as Element, 16, 16);
}

function handleDragOver(targetTabId: string) {
  const sourceTabId = draggingTabId.value;
  if (!sourceTabId || sourceTabId === targetTabId) {
    return;
  }

  const targetIndex = renderedTabs.value.findIndex(
    (tab) => tab.id === targetTabId,
  );
  if (targetIndex === -1) {
    return;
  }

  tabsStore.moveTab(sourceTabId, targetIndex);
}

function handleDrop(targetTabId: string, event: DragEvent) {
  if (!draggingTabId.value) {
    const sourceTabId = event.dataTransfer?.getData('text/plain');
    if (sourceTabId) {
      draggingTabId.value = sourceTabId;
    }
  }

  handleDragOver(targetTabId);
  handleDragEnd();
}

function handleDragEnd() {
  draggingTabId.value = null;
}

function setEditInputRef(tabId: string, element: unknown) {
  editInputRefs.set(
    tabId,
    element instanceof HTMLInputElement ? element : null,
  );
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
});
</script>

<style scoped>
@reference "@styles";

.chat-tabs {
  @apply min-h-0;
  --chat-tab-max-width: 13rem;
  --chat-tab-min-width: 4.5rem;
  --chat-tab-hover-surface: #e5e5e5;
  --chat-tab-active-surface: var(--color-toolbar-surface);
  --chat-tab-divider: var(--color-frame-border);
}

.chat-tabs-rail {
  @apply grid min-h-0 w-full grid-cols-[minmax(0,1fr)_auto] items-end bg-neutral-100;
}

.chat-tabs-primary {
  @apply grid min-w-0 grid-cols-[minmax(0,max-content)_1fr] items-end gap-1.5 pl-2 pr-0;
}

.chat-tabs-track {
  @apply flex min-w-0 items-end gap-1;
}

.chat-tabs-list {
  @apply flex min-w-0 max-w-full flex-1 items-end;
}

.chat-tab {
  @apply relative flex h-8 min-w-0 items-center text-[12px] text-neutral-800;
  flex: 1 1 var(--chat-tab-max-width);
  max-width: var(--chat-tab-max-width);
  min-width: var(--chat-tab-min-width);
}

.chat-tab-active {
  @apply z-10 text-neutral-950;
}

.chat-tab::before {
  @apply absolute left-0 top-1/2 h-5 w-px -translate-y-1/2;
  content: '';
  background: var(--chat-tab-divider);
}

.chat-tab::after {
  @apply absolute right-0 top-1/2 h-5 w-px -translate-y-1/2;
  content: '';
  background: var(--chat-tab-divider);
  opacity: 0;
}

.chat-tab-active::before,
.chat-tab:hover::before,
.chat-tab:hover + .chat-tab::before,
.chat-tab-active + .chat-tab::before {
  opacity: 0;
}

.chat-tab:first-child:not(.chat-tab-active):not(:hover)::before {
  opacity: 1;
}

.chat-tab:last-child:not(.chat-tab-active)::after {
  opacity: 1;
}

.chat-tab:last-child:hover::after {
  opacity: 0;
}

.chat-tab-dragging {
  @apply opacity-60;
}

.chat-tab-main {
  @apply relative z-10 flex h-8 min-w-0 flex-1 items-center gap-2 self-end rounded-[0.625rem] border border-transparent bg-transparent pl-4 pr-8 text-left;
}

.chat-tab-main::after {
  @apply absolute inset-x-1 inset-y-0.5 rounded-[0.625rem] bg-transparent;
  content: '';
  z-index: -1;
}

.chat-tab:not(.chat-tab-active) .chat-tab-main:hover::after {
  @apply bg-[var(--chat-tab-hover-surface)];
}

.chat-tab-active .chat-tab-main {
  @apply h-8 items-center rounded-t-[0.625rem] rounded-b-none border-frame-border border-b-transparent bg-[var(--chat-tab-active-surface)];
  margin-bottom: -1px;
}

.chat-tab-active .chat-tab-main::after {
  content: none;
}

.chat-tab-title {
  @apply block min-w-0 flex-1 truncate;
}

.chat-tab-active .chat-tab-title {
  transform: translateY(-1px);
}

.chat-tab-badge {
  @apply shrink-0 rounded-full border border-current/20 px-1.5 py-0.5 text-[10px] leading-none;
}

.chat-tab-actions {
  @apply absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center justify-end;
}

.chat-tab-close {
  @apply relative inline-flex h-5 w-5 items-center justify-center rounded-full text-[18px] leading-none text-neutral-700 opacity-80 hover:bg-black/8 hover:text-neutral-950 hover:opacity-100;
}

.chat-tab-edit {
  @apply relative z-10 flex h-8 w-full items-center gap-2 self-end rounded-t-[0.625rem] rounded-b-none border border-frame-border border-b-transparent bg-[var(--chat-tab-active-surface)] pl-4 pr-2;
  margin-bottom: -1px;
}

.chat-tab-input {
  @apply min-w-0 flex-1 bg-transparent text-[12px] font-semibold outline-hidden;
  transform: translateY(-1px);
}

.chat-tab-save {
  @apply inline-flex h-5 shrink-0 items-center self-center rounded-md border border-neutral-300 bg-white px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.04em] leading-none text-neutral-900 transition hover:bg-neutral-50;
}

.chat-tabs-add {
  @apply relative flex h-8 w-8 shrink-0 items-center justify-center self-end bg-transparent text-neutral-700 hover:text-neutral-950;
}

.chat-tabs-add::before {
  @apply absolute inset-[2px] rounded-[0.625rem] bg-transparent;
  content: '';
}

.chat-tabs-add:hover::before {
  @apply bg-[var(--chat-tab-hover-surface)];
}

.chat-tabs-add-label {
  @apply relative z-10 block text-[24px] font-normal leading-none;
}

.chat-tabs-empty-zone {
  @apply min-w-0 self-stretch;
}

.chat-tabs-secondary {
  @apply flex min-w-0 items-end justify-end px-2 pb-0.5;
}
</style>
