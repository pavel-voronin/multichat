<template>
  <Teleport to="body">
    <div
      v-if="ui.showHumanNameModal"
      class="human-modal-backdrop"
      @click.self="close"
    >
      <div class="human-modal-card">
        <h2 class="human-modal-title">Edit human</h2>

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
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useRuntimeStore } from '../stores/runtime';
import { useUiStore } from '../stores/ui';
import UiButton from './ui/UiButton.vue';
import UiInput from './ui/UiInput.vue';

const runtimeStore = useRuntimeStore();
const runtime = runtimeStore.requireRuntime();
const { state } = storeToRefs(runtimeStore);
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

  runtime.updateHumanParticipant({ name });
  close();
}
</script>

<style scoped>
@reference "../../styles.css";

.human-modal-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/20 p-6 backdrop-blur-sm;
}

.human-modal-card {
  @apply w-full max-w-md rounded-md border border-neutral-300 bg-white p-5 font-mono text-[13px] text-neutral-900 shadow-xl;
}

.human-modal-title {
  @apply m-0 text-base font-semibold;
}

.human-modal-field {
  @apply mt-4 grid gap-2;
}

.human-modal-label {
  @apply text-[12px] text-neutral-600;
}

.human-modal-actions {
  @apply mt-5 flex gap-2;
}
</style>
