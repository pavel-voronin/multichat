import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue';

type BubblePlacement = 'up' | 'down';

export function useFloatingHoverBubble(
  bubbleRef: Readonly<Ref<HTMLDivElement | null | undefined>>,
  options: { closeDelayMs?: number } = {},
) {
  const closeDelayMs = options.closeDelayMs ?? 80;
  const hoveredId = ref<string | null>(null);
  const triggerElement = ref<HTMLElement | null>(null);
  const bubbleStyle = ref<Record<string, string>>({});
  const bubblePlacement = ref<BubblePlacement>('down');
  let closeTimeout: ReturnType<typeof setTimeout> | null = null;

  function open(id: string, event: MouseEvent) {
    cancelClose();
    hoveredId.value = id;
    triggerElement.value = event.currentTarget as HTMLElement;
    void nextTick().then(() => updatePosition());
  }

  function scheduleClose() {
    cancelClose();
    closeTimeout = setTimeout(() => {
      close();
    }, closeDelayMs);
  }

  function cancelClose() {
    if (!closeTimeout) {
      return;
    }

    clearTimeout(closeTimeout);
    closeTimeout = null;
  }

  function close() {
    cancelClose();
    hoveredId.value = null;
    triggerElement.value = null;
  }

  function updatePosition() {
    const trigger = triggerElement.value;
    const bubble = bubbleRef.value;
    if (!trigger || !bubble) {
      return;
    }

    const anchorRect = trigger.getBoundingClientRect();
    const gap = 8;
    const bubbleRect = bubble.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    const placeDown =
      spaceBelow >= bubbleRect.height + gap || spaceBelow >= spaceAbove;

    bubblePlacement.value = placeDown ? 'down' : 'up';

    const left = Math.min(
      Math.max(gap, anchorRect.left),
      viewportWidth - bubbleRect.width - gap,
    );
    const top = placeDown
      ? Math.min(
          anchorRect.bottom + gap,
          viewportHeight - bubbleRect.height - gap,
        )
      : Math.max(gap, anchorRect.top - bubbleRect.height - gap);

    bubbleStyle.value = {
      left: `${left}px`,
      top: `${top}px`,
    };
  }

  onBeforeUnmount(() => {
    cancelClose();
  });

  return {
    hoveredId,
    bubbleStyle,
    bubblePlacement,
    open,
    scheduleClose,
    cancelClose,
    close,
    updatePosition,
  };
}
