import { defineStore, storeToRefs } from 'pinia';
import { computed, nextTick, ref } from 'vue';
import type { ChatMessage } from '../../core';
import { useRuntimeStore } from './runtime';

type MessageInputElement = { focus: () => void } | null;

export const useMessageInputStore = defineStore('messageInput', () => {
  const runtimeStore = useRuntimeStore();
  const runtime = computed(() => runtimeStore.requireRuntime());
  const { state } = storeToRefs(runtimeStore);
  const messageInputElement = ref<MessageInputElement>(null);
  const draftByTabId = ref<Record<string, string>>({});
  const activeTabId = computed(() => state.value?.activeTabId ?? '');
  const draftMessage = computed({
    get: () => draftByTabId.value[activeTabId.value] ?? '',
    set: (value: string) => {
      if (!activeTabId.value) {
        return;
      }
      draftByTabId.value = {
        ...draftByTabId.value,
        [activeTabId.value]: value,
      };
    },
  });

  const human = computed(
    () =>
      state.value?.participants.find(
        (participant) => participant.role === 'human',
      ) ?? null,
  );
  const canSend = computed(
    () => Boolean(draftMessage.value.trim()) && Boolean(human.value),
  );

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

  function mentionParticipantById(participantId: string): void {
    const participant = state.value?.participants.find(
      (item) => item.id === participantId,
    );
    if (!participant) {
      return;
    }

    draftMessage.value = addParticipantMentionPrefix(
      draftMessage.value,
      participant.name,
    );
    void nextTick().then(() => messageInputElement.value?.focus());
  }

  function mentionMessageSender(message: ChatMessage): void {
    mentionParticipantById(message.senderId);
  }

  async function sendCurrentMessage(): Promise<void> {
    if (!canSend.value || !human.value) {
      return;
    }

    const content = draftMessage.value;
    draftMessage.value = '';

    await nextTick();
    messageInputElement.value?.focus();

    await runtime.value.sendMessage({
      senderId: human.value.id,
      content,
      target: 'public',
    });
  }

  function setMessageInputElement(element: MessageInputElement): void {
    messageInputElement.value = element;
  }

  function clearDraft(tabId: string): void {
    if (!(tabId in draftByTabId.value)) {
      return;
    }

    const nextDrafts = { ...draftByTabId.value };
    delete nextDrafts[tabId];
    draftByTabId.value = nextDrafts;
  }

  function reset(): void {
    messageInputElement.value = null;
    draftByTabId.value = {};
  }

  return {
    draftMessage,
    canSend,
    sendCurrentMessage,
    mentionMessageSender,
    mentionParticipantById,
    setMessageInputElement,
    clearDraft,
    reset,
  };
});
