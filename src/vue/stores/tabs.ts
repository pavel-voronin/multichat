import { defineStore, storeToRefs } from 'pinia';
import { computed } from 'vue';
import type { MultiChatRuntime } from '../../core';
import type { RenderedTab } from '../types';
import { useMessageInputStore } from './messageInput';
import { useRuntimeStore } from './runtime';

export const useTabsStore = defineStore('tabs', () => {
  const runtimeStore = useRuntimeStore();
  const messageInputStore = useMessageInputStore();
  const { workspace } = storeToRefs(runtimeStore);
  const runtime = computed<MultiChatRuntime>(() =>
    runtimeStore.requireRuntime(),
  );

  const renderedTabs = computed<RenderedTab[]>(() =>
    workspace.value.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      isActive: tab.id === workspace.value.activeTabId,
      header: {
        title: tab.title,
        badge: null,
      },
    })),
  );

  function createTab(input?: Parameters<MultiChatRuntime['createTab']>[0]) {
    return runtime.value.createTab(input);
  }

  function activateTab(tabId: string): void {
    runtime.value.activateTab(tabId);
  }

  function renameTab(tabId: string, title: string): void {
    runtime.value.renameTab(tabId, title);
  }

  function moveTab(tabId: string, toIndex: number): void {
    runtime.value.moveTab(tabId, toIndex);
  }

  function closeTab(tabId: string): void {
    runtime.value.closeTab(tabId);
    messageInputStore.clearDraft(tabId);
  }

  return {
    workspace,
    renderedTabs,
    createTab,
    activateTab,
    renameTab,
    moveTab,
    closeTab,
  };
});
