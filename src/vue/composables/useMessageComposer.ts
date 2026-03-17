import { computed, nextTick, ref, type Ref } from 'vue';
import type { ChatMessage, MultiChatRuntime, Participant } from '../../core';

export function useMessageComposer(input: {
  runtime: MultiChatRuntime;
  participants: Readonly<Ref<Participant[]>>;
  human: Readonly<Ref<Participant | undefined>>;
  composerRef: Readonly<Ref<{ focus: () => void } | null | undefined>>;
}) {
  const draftMessage = ref('');
  const canSend = computed(
    () => Boolean(draftMessage.value.trim()) && Boolean(input.human.value),
  );

  async function sendCurrentMessage() {
    if (!canSend.value || !input.human.value) {
      return;
    }

    const content = draftMessage.value;
    draftMessage.value = '';

    await nextTick();
    input.composerRef.value?.focus();

    await input.runtime.sendMessage({
      senderId: input.human.value.id,
      content,
      target: 'public',
    });
  }

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

  function handleParticipantDblClick(participant: Participant) {
    draftMessage.value = addParticipantMentionPrefix(
      draftMessage.value,
      participant.name,
    );
    void nextTick().then(() => input.composerRef.value?.focus());
  }

  function handleMessageSenderDblClick(message: ChatMessage) {
    const participant = input.participants.value.find(
      (item) => item.id === message.senderId,
    );
    if (!participant) {
      return;
    }

    handleParticipantDblClick(participant);
  }

  function clearDraft() {
    draftMessage.value = '';
  }

  return {
    draftMessage,
    canSend,
    sendCurrentMessage,
    handleParticipantDblClick,
    handleMessageSenderDblClick,
    clearDraft,
  };
}
