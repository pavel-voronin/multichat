import { afterEach, describe, expect, it } from 'vitest';
import {
  loadUiState,
  saveUiState,
  defaultUiState,
  UI_PERSISTENCE_KEY,
} from '../../src/vue/uiPersistence';

afterEach(() => {
  localStorage.clear();
});

describe('loadUiState', () => {
  it('returns defaults when localStorage is empty', () => {
    expect(loadUiState()).toEqual(defaultUiState());
  });

  it('returns stored values when data is valid', () => {
    const state = {
      version: 1,
      showSilentDecisions: true,
      costDisplayMode: 'net',
      showLogsPanel: true,
      draftByTabId: { 'tab-1': 'hello' },
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    expect(loadUiState()).toEqual({
      showSilentDecisions: true,
      costDisplayMode: 'net',
      showLogsPanel: true,
      draftByTabId: { 'tab-1': 'hello' },
    });
  });

  it('returns defaults and removes the key when version mismatches', () => {
    localStorage.setItem(
      UI_PERSISTENCE_KEY,
      JSON.stringify({ version: 999, showSilentDecisions: true }),
    );
    expect(loadUiState()).toEqual(defaultUiState());
    expect(localStorage.getItem(UI_PERSISTENCE_KEY)).toBeNull();
  });

  it('returns defaults when JSON is invalid', () => {
    localStorage.setItem(UI_PERSISTENCE_KEY, 'not-json{{{');
    expect(loadUiState()).toEqual(defaultUiState());
  });

  it('falls back costDisplayMode to default when value is not in allowlist', () => {
    const state = {
      version: 1,
      showSilentDecisions: false,
      costDisplayMode: 'turbo',
      showLogsPanel: false,
      draftByTabId: {},
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    expect(loadUiState().costDisplayMode).toBe('request');
  });

  it('falls back boolean fields to defaults when they have wrong type', () => {
    const state = {
      version: 1,
      showSilentDecisions: 'yes',
      costDisplayMode: 'request',
      showLogsPanel: 1,
      draftByTabId: {},
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    const result = loadUiState();
    expect(result.showSilentDecisions).toBe(false);
    expect(result.showLogsPanel).toBe(false);
  });

  it('filters non-string values from draftByTabId', () => {
    const state = {
      version: 1,
      showSilentDecisions: false,
      costDisplayMode: 'request',
      showLogsPanel: false,
      draftByTabId: { 'tab-1': 'hello', 'tab-2': 42, 'tab-3': null },
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    expect(loadUiState().draftByTabId).toEqual({ 'tab-1': 'hello' });
  });

  it('falls back draftByTabId to {} when it is not an object', () => {
    const state = {
      version: 1,
      showSilentDecisions: false,
      costDisplayMode: 'request',
      showLogsPanel: false,
      draftByTabId: 'bad',
    };
    localStorage.setItem(UI_PERSISTENCE_KEY, JSON.stringify(state));
    expect(loadUiState().draftByTabId).toEqual({});
  });
});

describe('saveUiState', () => {
  it('writes to localStorage', () => {
    saveUiState({
      version: 1,
      showSilentDecisions: true,
      costDisplayMode: 'net',
      showLogsPanel: true,
      draftByTabId: { 'tab-1': 'hi' },
    });
    expect(localStorage.getItem(UI_PERSISTENCE_KEY)).not.toBeNull();
  });

  it('round-trips: save then load', () => {
    saveUiState({
      version: 1,
      showSilentDecisions: true,
      costDisplayMode: 'off',
      showLogsPanel: true,
      draftByTabId: { 'tab-a': 'draft' },
    });
    expect(loadUiState()).toEqual({
      showSilentDecisions: true,
      costDisplayMode: 'off',
      showLogsPanel: true,
      draftByTabId: { 'tab-a': 'draft' },
    });
  });
});
