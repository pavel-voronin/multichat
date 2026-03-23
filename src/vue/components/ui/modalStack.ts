type ModalStackEntry = {
  token: symbol;
  close: () => void;
};

const modalStack: ModalStackEntry[] = [];
let isEscapeListenerAttached = false;

function handleGlobalEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  modalStack.at(-1)?.close();
}

function ensureEscapeListener(): void {
  if (isEscapeListenerAttached) return;
  window.addEventListener('keydown', handleGlobalEscape);
  isEscapeListenerAttached = true;
}

function cleanupEscapeListener(): void {
  if (!isEscapeListenerAttached || modalStack.length > 0) return;
  window.removeEventListener('keydown', handleGlobalEscape);
  isEscapeListenerAttached = false;
}

export function registerModal(token: symbol, close: () => void): void {
  if (modalStack.some((entry) => entry.token === token)) return;
  modalStack.push({ token, close });
  ensureEscapeListener();
}

export function unregisterModal(token: symbol): void {
  let index = -1;
  for (let i = modalStack.length - 1; i >= 0; i -= 1) {
    if (modalStack[i]?.token === token) {
      index = i;
      break;
    }
  }

  if (index === -1) return;
  modalStack.splice(index, 1);
  cleanupEscapeListener();
}
