import { inject, provide } from 'vue';

export interface OverlayControls {
  openCostBubble: (messageId: string, event: MouseEvent) => void;
  scheduleCostBubbleClose: () => void;
  openModelPriceBubble: (participantId: string, event: MouseEvent) => void;
  scheduleModelPriceBubbleClose: () => void;
}

const overlayControlsInjectionKey = Symbol('multi-chat-overlay-controls');

export function provideOverlayControls(controls: OverlayControls): void {
  provide(overlayControlsInjectionKey, controls);
}

export function useOverlayControls(): OverlayControls {
  const controls = inject<OverlayControls | null>(overlayControlsInjectionKey, null);
  if (!controls) {
    throw new Error('Overlay controls were not provided');
  }

  return controls;
}
