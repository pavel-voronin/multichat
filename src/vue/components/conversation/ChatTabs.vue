<template>
  <section class="chat-tabs">
    <div class="chat-tabs-rail" @click="handleRailClick">
      <div
        ref="scrollElement"
        class="chat-tabs-scroll"
        @click="handleRailClick"
        @dblclick="createTab"
      >
        <div class="chat-tabs-list">
          <div
            v-for="tab in renderedTabs"
            :key="tab.id"
            :ref="(element) => setTabElementRef(tab.id, element)"
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
                <span
                  class="chat-tab-title"
                  @dblclick.stop="startRename(tab)"
                  >{{ tab.header.title }}</span
                >
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
          <div class="chat-tabs-endcap" aria-hidden="false">
            <button
              type="button"
              class="chat-tabs-add"
              aria-label="Add tab"
              @dblclick.stop
              @click.stop="createTab"
            >
              <span class="chat-tabs-add-label">+</span>
            </button>
            <div
              class="chat-tabs-empty-zone"
              @click.stop="handleRailClick"
              @dblclick.stop="createTab"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import type { RenderedTab } from '../../types';
import { useInspectionStore } from '../../stores/inspection';
import { useTabsStore } from '../../stores/tabs';
import { useUiStore } from '../../stores/ui';

type EditableInput = HTMLInputElement | null;
type TabElement = HTMLDivElement | null;

const tabsStore = useTabsStore();
const { workspace, renderedTabs } = storeToRefs(tabsStore);
const ui = useUiStore();
const inspection = useInspectionStore();
const editingTabId = ref<string | null>(null);
const editingTitle = ref('');
const draggingTabId = ref<string | null>(null);
const editInputRefs = new Map<string, EditableInput>();
const tabElementRefs = new Map<string, TabElement>();
const scrollElementRef = useTemplateRef<HTMLDivElement>('scrollElement');

function createTab() {
  cancelRename();
  const tab = tabsStore.createTab({ activate: true });
  ui.resetChatScopedState();
  inspection.reset();
  void nextTick(() => {
    scrollTabIntoView(tab.id);
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
  void nextTick(() => {
    scrollTabIntoView(tabId);
  });
}

function startRename(tab: RenderedTab) {
  editingTabId.value = tab.id;
  editingTitle.value = tab.title;
  void nextTick(() => {
    scrollTabIntoView(tab.id);
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

function setTabElementRef(tabId: string, element: unknown) {
  tabElementRefs.set(tabId, element instanceof HTMLDivElement ? element : null);
}

function scrollTabIntoView(tabId: string) {
  const element = tabElementRefs.get(tabId);
  const container = scrollElementRef.value;
  if (!element || !container) {
    return;
  }

  const visibilityMargin = 8;
  const tabLeft = element.offsetLeft;
  const tabRight = tabLeft + element.offsetWidth;
  const viewLeft = container.scrollLeft;
  const viewRight = viewLeft + container.clientWidth;
  const scrollContainer = (left: number, behavior: ScrollBehavior) => {
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ left, behavior });
      return;
    }

    container.scrollLeft = left;
  };

  if (tabLeft < viewLeft + visibilityMargin) {
    scrollContainer(Math.max(0, tabLeft - visibilityMargin), 'smooth');
    return;
  }

  if (tabRight > viewRight - visibilityMargin) {
    scrollContainer(
      Math.max(0, tabRight - container.clientWidth + visibilityMargin),
      'smooth',
    );
  }
}

watch(
  () =>
    workspace.value
      ? `${workspace.value.activeTabId}::${workspace.value.tabs.map((tab) => tab.id).join('|')}`
      : null,
  async () => {
    if (!workspace.value) return;
    await nextTick();
    scrollTabIntoView(workspace.value.activeTabId);
  },
  { immediate: true },
);

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
}

.chat-tabs-rail {
  @apply flex min-h-0 items-stretch bg-neutral-100;
}

.chat-tabs-scroll {
  @apply min-w-0 flex-1 overflow-x-auto overflow-y-hidden;
  overscroll-behavior-x: none;
  overscroll-behavior-y: none;
  scrollbar-width: none;
}

.chat-tabs-scroll::-webkit-scrollbar {
  display: none;
}

.chat-tabs-list {
  @apply flex items-end pt-1;
  min-width: 100%;
  width: max-content;
}

.chat-tab {
  @apply relative -mr-px flex h-8 w-48 shrink-0 items-center border border-frame-border bg-neutral-200 text-[12px] text-neutral-700 transition;
  border-top-left-radius: 0.625rem;
  border-top-right-radius: 0.625rem;
}

.chat-tab-active {
  @apply z-10 border-b-transparent bg-toolbar-surface text-neutral-950;
}

.chat-tab-dragging {
  @apply opacity-60;
}

.chat-tab-main {
  @apply flex min-w-0 flex-1 items-center gap-2 self-stretch pl-3 pr-1 text-left;
}

.chat-tab-title {
  @apply block min-w-0 flex-1 truncate;
}

.chat-tab-badge {
  @apply shrink-0 rounded-full border border-current/20 px-1.5 py-0.5 text-[10px] leading-none;
}

.chat-tab-actions {
  @apply flex shrink-0 items-center justify-end self-stretch pr-2;
}

.chat-tab-close {
  @apply relative z-10 h-full px-1 text-base leading-none text-neutral-900 opacity-55 transition hover:opacity-100;
}

.chat-tab-edit {
  @apply flex h-full w-full items-center gap-2 pl-3 pr-2;
}

.chat-tab-input {
  @apply min-w-0 flex-1 bg-transparent text-[12px] font-semibold outline-hidden;
}

.chat-tab-save {
  @apply inline-flex h-5 shrink-0 items-center self-center rounded-md border border-neutral-300 bg-white px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.04em] leading-none text-neutral-900 transition hover:bg-neutral-50;
}

.chat-tabs-endcap {
  @apply sticky right-0 z-20 ml-px flex h-8 min-w-7 flex-1 items-stretch bg-neutral-100 pl-1;
}

.chat-tabs-endcap::after {
  content: '';
  position: absolute;
  left: 1px;
  right: 0.375rem;
  bottom: 0;
  border-bottom: 1px solid var(--color-frame-border);
  pointer-events: none;
}

.chat-tabs-add {
  @apply relative flex h-full w-7 shrink-0 items-center self-stretch bg-neutral-100 pl-2 text-left text-neutral-700;
}

.chat-tabs-add-label {
  @apply block text-[20px] font-normal leading-none;
}

.chat-tabs-empty-zone {
  @apply min-w-0 flex-1 self-stretch bg-neutral-100;
}
</style>
