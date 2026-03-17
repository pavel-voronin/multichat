import { inject, provide, type ComputedRef, type Ref } from 'vue';
import type { ChatMessage } from '../core';

export interface ComposerState {
  draftMessage: Ref<string>;
  canSend: ComputedRef<boolean>;
  sendCurrentMessage: () => Promise<void>;
  mentionMessageSender: (message: ChatMessage) => void;
  mentionParticipantById: (participantId: string) => void;
  setComposerElement: (element: { focus: () => void } | null) => void;
}

const composerStateInjectionKey = Symbol('multi-chat-composer-state');

export function provideComposerState(state: ComposerState): void {
  provide(composerStateInjectionKey, state);
}

export function useComposerState(): ComposerState {
  const state = inject<ComposerState | null>(composerStateInjectionKey, null);
  if (!state) {
    throw new Error('Composer state was not provided');
  }

  return state;
}
