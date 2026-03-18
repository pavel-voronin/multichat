import { markRaw, shallowRef } from 'vue';

export interface OverlayControls {
  openCostBubble: (messageId: string, event: MouseEvent) => void;
  scheduleCostBubbleClose: () => void;
  openModelPriceBubble: (participantId: string, event: MouseEvent) => void;
  scheduleModelPriceBubbleClose: () => void;
}

type OverlayControllerHandle = {
  openCostBubble: (messageId: string, event: MouseEvent) => void;
  scheduleCostBubbleClose: () => void;
  openModelPriceBubble: (participantId: string, event: MouseEvent) => void;
  scheduleModelPriceBubbleClose: () => void;
};

const overlays = shallowRef<OverlayControllerHandle | null>(null);

export function setOverlayControls(
  nextOverlays: OverlayControllerHandle | null,
): void {
  overlays.value = nextOverlays ? markRaw(nextOverlays) : null;
}

export function useOverlayControls(): OverlayControls {
  return {
    openCostBubble(messageId: string, event: MouseEvent): void {
      overlays.value?.openCostBubble(messageId, event);
    },
    scheduleCostBubbleClose(): void {
      overlays.value?.scheduleCostBubbleClose();
    },
    openModelPriceBubble(participantId: string, event: MouseEvent): void {
      overlays.value?.openModelPriceBubble(participantId, event);
    },
    scheduleModelPriceBubbleClose(): void {
      overlays.value?.scheduleModelPriceBubbleClose();
    },
  };
}
