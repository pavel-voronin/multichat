import type { Component } from 'vue';
import type { ChatEntry } from '../../../core';
import ParticipantMessageEntryVue from './entries/ParticipantMessageEntry.vue';
import ParticipantJoinedEntryVue from './entries/ParticipantJoinedEntry.vue';
import ParticipantLeftEntryVue from './entries/ParticipantLeftEntry.vue';
import TopicChangedEntryVue from './entries/TopicChangedEntry.vue';
import SilentDecisionEntryVue from './entries/SilentDecisionEntry.vue';
import RuntimeErrorEntryVue from './entries/RuntimeErrorEntry.vue';
import SweepStartedEntryVue from './entries/SweepStartedEntry.vue';
import SweepFinishedEntryVue from './entries/SweepFinishedEntry.vue';
import SweepStoppedEntryVue from './entries/SweepStoppedEntry.vue';

export const entryRegistry: Record<ChatEntry['kind'], Component> = {
  'participant-message': ParticipantMessageEntryVue,
  'participant-joined': ParticipantJoinedEntryVue,
  'participant-left': ParticipantLeftEntryVue,
  'topic-changed': TopicChangedEntryVue,
  'silent-decision': SilentDecisionEntryVue,
  'runtime-error': RuntimeErrorEntryVue,
  'sweep-started': SweepStartedEntryVue,
  'sweep-finished': SweepFinishedEntryVue,
  'sweep-stopped': SweepStoppedEntryVue,
};
