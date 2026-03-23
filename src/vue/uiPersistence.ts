import type { CostDisplayMode } from './types';

export const UI_PERSISTENCE_KEY = 'multichat-ui-state';
export const UI_PERSISTENCE_VERSION = 1;

const COST_DISPLAY_MODES = [
  'off',
  'request',
  'net',
] as const satisfies readonly CostDisplayMode[];

export interface UiPersistedState {
  version: number;
  showSilentDecisions: boolean;
  costDisplayMode: CostDisplayMode;
  showLogsPanel: boolean;
  draftByTabId: Record<string, string>;
}

export function defaultUiState(): Omit<UiPersistedState, 'version'> {
  return {
    showSilentDecisions: false,
    costDisplayMode: 'request',
    showLogsPanel: false,
    draftByTabId: {},
  };
}

export function loadUiState(): Omit<UiPersistedState, 'version'> {
  const defaults = defaultUiState();
  const raw = localStorage.getItem(UI_PERSISTENCE_KEY);
  if (!raw) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as UiPersistedState).version !== UI_PERSISTENCE_VERSION
  ) {
    localStorage.removeItem(UI_PERSISTENCE_KEY);
    return defaults;
  }

  const data = parsed as Record<string, unknown>;

  const showSilentDecisions =
    typeof data.showSilentDecisions === 'boolean'
      ? data.showSilentDecisions
      : defaults.showSilentDecisions;

  const costDisplayMode = COST_DISPLAY_MODES.includes(
    data.costDisplayMode as CostDisplayMode,
  )
    ? (data.costDisplayMode as CostDisplayMode)
    : defaults.costDisplayMode;

  const showLogsPanel =
    typeof data.showLogsPanel === 'boolean'
      ? data.showLogsPanel
      : defaults.showLogsPanel;

  let draftByTabId: Record<string, string> = {};
  if (
    typeof data.draftByTabId === 'object' &&
    data.draftByTabId !== null &&
    !Array.isArray(data.draftByTabId)
  ) {
    for (const [k, v] of Object.entries(data.draftByTabId)) {
      if (typeof v === 'string') {
        draftByTabId[k] = v;
      }
    }
  }

  return { showSilentDecisions, costDisplayMode, showLogsPanel, draftByTabId };
}

export function saveUiState(state: UiPersistedState): void {
  localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
}
