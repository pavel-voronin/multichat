import { defineStore, storeToRefs } from 'pinia';
import { computed } from 'vue';
import type { RenderedParticipant } from '../types';
import { formatMessageCost } from '../utils/costing';
import { usePreferencesStore } from './preferences';
import { useRuntimeStore } from './runtime';

export const useParticipantsStore = defineStore('participants', () => {
  const runtimeStore = useRuntimeStore();
  const preferencesStore = usePreferencesStore();
  const { state } = storeToRefs(runtimeStore);

  const participantRows = computed<RenderedParticipant[]>(() =>
    state.value.participants
      .filter((participant) => {
        if (participant.role === 'human') {
          return true;
        }

        const agent = state.value.agents.find(
          (item) => item.id === participant.id,
        );
        return agent?.isHidden !== true;
      })
      .map((participant) => ({
        id: participant.id,
        name: participant.name,
        role: participant.role,
        subtitle:
          participant.role === 'human'
            ? 'human'
            : (state.value.agents.find((agent) => agent.id === participant.id)
                ?.modelId ?? participant.role),
        showMoney:
          preferencesStore.costDisplayMode !== 'off' &&
          participant.role === 'agent' &&
          state.value.agents.find((agent) => agent.id === participant.id)
            ?.isHidden !== true,
        spentSummary: formatMessageCost(
          participant.role === 'agent'
            ? (state.value.metrics[participant.id]?.estimatedCost ?? 0)
            : 0,
        ),
      })),
  );

  return {
    participantRows,
  };
});
