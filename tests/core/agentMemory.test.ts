import { describe, expect, it } from 'vitest';
import {
  applyMemoryAdd,
  applyMemoryDelete,
  applyMemoryUpdate,
  formatMemoryForPrompt,
  nextMemoryId,
} from '../../src/core/agentMemory';

describe('nextMemoryId', () => {
  it('returns 1 for empty memory', () => {
    expect(nextMemoryId({})).toBe(1);
  });
  it('returns max id + 1', () => {
    expect(nextMemoryId({ 1: 'a', 3: 'b', 2: 'c' })).toBe(4);
  });
});

describe('applyMemoryAdd', () => {
  it('adds a new entry with next id', () => {
    expect(applyMemoryAdd({}, 'hello')).toEqual({ 1: 'hello' });
  });
  it('is a no-op when content is empty', () => {
    expect(applyMemoryAdd({ 1: 'existing' }, '')).toEqual({ 1: 'existing' });
  });
  it('appends alongside existing entries', () => {
    expect(applyMemoryAdd({ 1: 'first' }, 'second')).toEqual({ 1: 'first', 2: 'second' });
  });
});

describe('applyMemoryUpdate', () => {
  it('updates an existing entry', () => {
    expect(applyMemoryUpdate({ 1: 'old', 2: 'keep' }, 1, 'new')).toEqual({ 1: 'new', 2: 'keep' });
  });
  it('deletes when content is empty', () => {
    expect(applyMemoryUpdate({ 1: 'old', 2: 'keep' }, 1, '')).toEqual({ 2: 'keep' });
  });
  it('is a no-op for unknown id', () => {
    expect(applyMemoryUpdate({ 1: 'a' }, 99, 'x')).toEqual({ 1: 'a' });
  });
});

describe('applyMemoryDelete', () => {
  it('removes an entry by id', () => {
    expect(applyMemoryDelete({ 1: 'a', 2: 'b' }, 1)).toEqual({ 2: 'b' });
  });
  it('is a no-op for unknown id', () => {
    expect(applyMemoryDelete({ 1: 'a' }, 99)).toEqual({ 1: 'a' });
  });
});

describe('formatMemoryForPrompt', () => {
  it('returns empty message when memory is empty', () => {
    expect(formatMemoryForPrompt({})).toBe('Your saved memory is empty.');
  });
  it('returns sorted numbered list', () => {
    expect(formatMemoryForPrompt({ 2: 'second', 1: 'first' })).toBe(
      'Your saved memory:\n- 1: first\n- 2: second',
    );
  });
});
