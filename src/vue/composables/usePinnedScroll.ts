import { ref, type Ref } from 'vue';

export function usePinnedScroll(
  elementRef: Readonly<Ref<HTMLDivElement | null | undefined>>,
  options: {
    threshold?: number;
    onPinnedStateUpdated?: () => void;
  } = {},
) {
  const threshold = options.threshold ?? 12;
  const isPinnedToBottom = ref(true);

  function isNearBottom(element: HTMLDivElement): boolean {
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <= threshold
    );
  }

  function updatePinnedState() {
    const element = elementRef.value;
    if (!element) {
      return;
    }

    isPinnedToBottom.value = isNearBottom(element);
    options.onPinnedStateUpdated?.();
  }

  function scrollToBottomIfPinned() {
    const element = elementRef.value;
    if (!element || !isPinnedToBottom.value) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }

  function pinToBottom() {
    isPinnedToBottom.value = true;
  }

  return {
    isPinnedToBottom,
    updatePinnedState,
    scrollToBottomIfPinned,
    pinToBottom,
  };
}
