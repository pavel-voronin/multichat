<template>
  <UiModal :open="ui.showHumanNameModal" size="sm" @close="close">
    <template #title>
      <h2 class="human-modal-title">Edit human</h2>
    </template>

    <label class="human-modal-field">
      <span class="human-modal-label">Display name</span>
      <UiInput
        v-model="draftName"
        class="human-modal-input"
        type="text"
        placeholder="Human"
        @keydown.enter.prevent="save"
      />
    </label>

    <div class="human-modal-actions">
      <UiButton
        class="human-modal-primary-button"
        variant="primary"
        :disabled="!draftName.trim()"
        @click="save"
      >
        Save
      </UiButton>
      <UiButton class="human-modal-secondary-button" @click="close">
        Cancel
      </UiButton>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useRuntimeStore } from '../../stores/runtime';
import { useSessionStore } from '../../stores/session';
import { useUiStore } from '../../stores/ui';
import UiButton from '../ui/UiButton.vue';
import UiInput from '../ui/UiInput.vue';
import UiModal from '../ui/UiModal.vue';

const session = useSessionStore();
const { state } = storeToRefs(useRuntimeStore());
const ui = useUiStore();
const humanName = computed(
  () =>
    state.value.participants.find((participant) => participant.role === 'human')
      ?.name ?? 'Human',
);
const draftName = ref(humanName.value);

watch(
  () => ui.showHumanNameModal,
  (isOpen) => {
    if (isOpen) {
      draftName.value = humanName.value;
    }
  },
);

function close() {
  ui.showHumanNameModal = false;
}

function save() {
  const name = draftName.value.trim();
  if (!name) {
    return;
  }

  session.updateHumanParticipant({ name });
  close();
}
</script>

<style scoped>
@reference "@styles";

.human-modal-title {
  @apply m-0 text-base font-semibold;
}

.human-modal-field {
  @apply mt-4 grid gap-2 px-5;
}

.human-modal-label {
  @apply text-[12px] text-neutral-600;
}

.human-modal-actions {
  @apply mt-5 flex gap-2 px-5 pb-5;
}
</style>
