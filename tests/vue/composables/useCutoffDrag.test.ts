import { afterEach, describe, expect, it } from 'vitest';
import {
  reorderEntriesForDragPreview,
  resolveContextWindowSizeFromDropTarget,
  stopDrag,
} from '../../../src/vue/composables/useCutoffDrag';
import type { VisibleTimelineEntry } from '../../../src/vue/types';

// Reset singleton state after every test — required for any test that calls startDrag()
afterEach(() => {
  stopDrag();
});

function makeMessage(id: string): VisibleTimelineEntry {
  return { kind: 'message', id, sortAt: 0, isMuted: false } as VisibleTimelineEntry;
}

function makeManualCutoff(id: string): VisibleTimelineEntry {
  return {
    kind: 'history-cutoff',
    id,
    sortAt: 0,
    cutoff: { source: 'manual' },
  } as VisibleTimelineEntry;
}

function makePreviewCutoff(id: string): VisibleTimelineEntry {
  return {
    kind: 'history-cutoff',
    id,
    sortAt: 0,
    cutoff: { source: 'preview', label: 'preview', anchor: { kind: 'end' }, agentIds: [], agentNames: [] },
  } as VisibleTimelineEntry;
}

describe('reorderEntriesForDragPreview', () => {
  it('returns entries unchanged when cutoffId is null (no drag active)', () => {
    const entries = [makeMessage('m1'), makeManualCutoff('c1'), makeMessage('m2')];
    expect(reorderEntriesForDragPreview(entries, null, undefined)).toEqual(entries);
  });

  it('hides the manual cutoff from the list when targetId is undefined (dragged outside)', () => {
    const m1 = makeMessage('m1');
    const c1 = makeManualCutoff('c1');
    const m2 = makeMessage('m2');
    const result = reorderEntriesForDragPreview([m1, c1, m2], 'c1', undefined);
    expect(result).toEqual([m1, m2]);
  });

  it('appends cutoff at end when targetId is null (dragged past last entry)', () => {
    const m1 = makeMessage('m1');
    const c1 = makeManualCutoff('c1');
    const m2 = makeMessage('m2');
    const result = reorderEntriesForDragPreview([m1, c1, m2], 'c1', null);
    expect(result).toEqual([m1, m2, c1]);
  });

  it('inserts cutoff before the target entry', () => {
    const m1 = makeMessage('m1');
    const c1 = makeManualCutoff('c1');
    const m2 = makeMessage('m2');
    const m3 = makeMessage('m3');
    const result = reorderEntriesForDragPreview([m1, c1, m2, m3], 'c1', 'm3');
    expect(result).toEqual([m1, m2, c1, m3]);
  });
});

describe('resolveContextWindowSizeFromDropTarget', () => {
  it('returns null when there is no preview cutoff in entries', () => {
    const entries = [makeMessage('m1'), makeManualCutoff('c1')];
    expect(resolveContextWindowSizeFromDropTarget(entries, 'm1')).toBeNull();
  });

  it('counts messages after the preview cutoff', () => {
    const entries = [makeMessage('m1'), makePreviewCutoff('p1'), makeMessage('m2'), makeMessage('m3')];
    // targetId doesn't matter here — entries already contain preview in the right position
    expect(resolveContextWindowSizeFromDropTarget(entries, null)).toBe(2);
  });

  it('returns 1 (minimum) when no messages come after the preview cutoff', () => {
    const entries = [makeMessage('m1'), makeMessage('m2'), makePreviewCutoff('p1')];
    expect(resolveContextWindowSizeFromDropTarget(entries, null)).toBe(1);
  });
});
