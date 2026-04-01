<template>
  <div class="memory-editor">
    <ul v-if="entries.length > 0" class="memory-list">
      <li v-for="entry in entries" :key="entry.id" class="memory-entry">
        <template v-if="editingId === entry.id">
          <span class="memory-entry-id">#{{ entry.id }}</span>
          <UiInput
            v-model="editingContent"
            class="memory-entry-input"
            @keydown.enter="saveEdit(entry.id)"
            @keydown.escape="cancelEdit"
          />
          <UiButton size="sm" variant="primary" @click="saveEdit(entry.id)">Save</UiButton>
          <UiButton size="sm" @click="cancelEdit">Cancel</UiButton>
        </template>
        <template v-else>
          <span class="memory-entry-id">#{{ entry.id }}</span>
          <span class="memory-entry-content">{{ entry.content }}</span>
          <UiButton size="sm" @click="startEdit(entry.id, entry.content)">Edit</UiButton>
          <UiButton size="sm" variant="danger" @click="deleteEntry(entry.id)">Delete</UiButton>
        </template>
      </li>
    </ul>
    <p v-else class="memory-empty">No memory entries yet.</p>
    <div class="memory-add-row">
      <UiInput
        v-model="newContent"
        class="memory-add-input"
        placeholder="New memory entry..."
        @keydown.enter="addEntry"
      />
      <UiButton variant="primary" size="sm" :disabled="!newContent.trim()" @click="addEntry">Add</UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { nextMemoryId } from '@/core/agentMemory';
import UiButton from '@/vue/components/ui/UiButton.vue';
import UiInput from '@/vue/components/ui/UiInput.vue';

const props = defineProps<{
  memory: Record<number, string>;
}>();

const emit = defineEmits<{
  (e: 'update:memory', value: Record<number, string>): void;
}>();

const editingId = ref<number | null>(null);
const editingContent = ref('');
const newContent = ref('');

const entries = computed(() =>
  Object.keys(props.memory)
    .map(Number)
    .sort((a, b) => a - b)
    .map((id) => ({ id, content: props.memory[id]! })),
);

function startEdit(id: number, content: string) {
  editingId.value = id;
  editingContent.value = content;
}

function cancelEdit() {
  editingId.value = null;
  editingContent.value = '';
}

function saveEdit(id: number) {
  const content = editingContent.value.trim();
  if (content === '') {
    deleteEntry(id);
  } else {
    emit('update:memory', { ...props.memory, [id]: content });
  }
  cancelEdit();
}

function deleteEntry(id: number) {
  const updated = { ...props.memory };
  delete updated[id];
  emit('update:memory', updated);
}

function addEntry() {
  const content = newContent.value.trim();
  if (!content) return;
  const id = nextMemoryId(props.memory);
  emit('update:memory', { ...props.memory, [id]: content });
  newContent.value = '';
}
</script>

<style scoped>
@reference "@styles";

.memory-editor {
  @apply flex flex-col gap-2;
}

.memory-list {
  @apply flex flex-col gap-1;
}

.memory-entry {
  @apply flex items-center gap-2;
}

.memory-entry-id {
  @apply shrink-0 text-[12px] font-mono text-neutral-400 w-8;
}

.memory-entry-content {
  @apply flex-1 text-[13px] text-neutral-800 truncate;
}

.memory-entry-input {
  @apply flex-1 h-6 py-0 text-[13px];
}

.memory-empty {
  @apply text-[13px] text-neutral-400 italic;
}

.memory-add-row {
  @apply flex items-center gap-2 pt-1 border-t border-neutral-200;
}

.memory-add-input {
  @apply flex-1 text-[13px];
}
</style>
