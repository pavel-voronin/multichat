import type { ParticipantMessageEntry } from '../../core';
import { useInspectionStore } from '../stores/inspection';
import { useTimelineStore } from '../stores/timeline';

export function useEntryInspection(entry: ParticipantMessageEntry) {
  const inspection = useInspectionStore();

  const canInspect = true;

  function handleInspectClick(event?: Event): void {
    event?.stopPropagation();
    inspection.openForEntry(entry.id);
  }

  return { canInspect, handleInspectClick };
}

export function useEntryInspectionByTrace(entry: { sourceTraceId?: string }) {
  const inspection = useInspectionStore();
  const timeline = useTimelineStore();

  const canInspect = Boolean(entry.sourceTraceId);

  function handleInspectClick(): void {
    if (!entry.sourceTraceId) return;
    const traceId = entry.sourceTraceId;
    const target = timeline.state.timeline.find(
      (e): e is ParticipantMessageEntry =>
        e.kind === 'participant-message' && e.sourceTraceId === traceId,
    );
    if (target) inspection.openForEntry(target.id);
  }

  return { canInspect, handleInspectClick };
}
