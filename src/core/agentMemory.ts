export function nextMemoryId(memory: Record<number, string>): number {
  const ids = Object.keys(memory).map(Number);
  return ids.length === 0 ? 1 : Math.max(...ids) + 1;
}

export function applyMemoryAdd(
  memory: Record<number, string>,
  content: string,
): Record<number, string> {
  if (content === '') return { ...memory };
  const id = nextMemoryId(memory);
  return { ...memory, [id]: content };
}

export function applyMemoryUpdate(
  memory: Record<number, string>,
  id: number,
  content: string,
): Record<number, string> {
  if (!(id in memory)) return { ...memory };
  if (content === '') return applyMemoryDelete(memory, id);
  return { ...memory, [id]: content };
}

export function applyMemoryDelete(
  memory: Record<number, string>,
  id: number,
): Record<number, string> {
  const result = { ...memory };
  delete result[id];
  return result;
}

export function formatMemoryForPrompt(memory: Record<number, string>): string {
  const ids = Object.keys(memory)
    .map(Number)
    .sort((a, b) => a - b);
  if (ids.length === 0) return 'Your saved memory is empty.';
  const lines = ids.map((id) => `- ${id}: ${memory[id]}`);
  return `Your saved memory:\n${lines.join('\n')}`;
}
