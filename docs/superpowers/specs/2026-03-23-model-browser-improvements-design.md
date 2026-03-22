# Model Browser Improvements

**Date:** 2026-03-23
**Status:** Approved

## Overview

Three connected improvements to the model selection UX: a table layout for ModelBrowserDialog with data fixes, a consistent close button pattern across all modals, and a reordered flow for creating new agents.

---

## 1. ModelBrowserDialog — Table Layout

### Layout

Replace the current button-list layout with a proper `<table>`. The dialog structure becomes:

```
┌─ Title bar ──────────────────────────────────── [✕] ─┐
│ Select Model                                          │
├─ Search ─────────────────────────────────────────────┤
│ [ Search by name or provider…                      ] │
├─ Sidebar ──┬─ Table ──────────────────────────────────┤
│ Free only  │ Provider ↑ │ Name ↕ │ Context ↕ │ Input /M ↕ │ Output /M ↕ │
│            ├────────────┼────────┼───────────┼────────────┼─────────────┤
│ Min context│ anthropic  │ Claude │ 200k      │ $3.00      │ $15.00      │
│ ○ Any      │ …          │ …      │ …         │ …    │ …     │
│ ○ ≥ 8k     │
│ ○ ≥ 32k    │
│ ○ ≥ 128k   │
│ ○ ≥ 200k   │
│ ○ ≥ 1M     │
└────────────┴──────────────────────────────────────────┘
```

### Columns

| Column | Alignment | Notes |
|--------|-----------|-------|
| Provider | left | Extracted from model ID (`id.split('/')[0]`) |
| Name | left | Cleaned name (see vendor dedup below) |
| Context | right | Formatted as `8k`, `128k`, `1M` |
| Input /M | right | Price per 1M input tokens |
| Output /M | right | Price per 1M output tokens |

All columns are sortable by clicking the header. Default sort: Provider ASC, then Name ASC.

### Data Display Rules

**Vendor dedup:** Strip leading `"VendorLabel: "` prefix from `model.name` when it matches the provider. Detection: extract the provider slug from the model ID (`id.split('/')[0]`). If `model.name` starts with that slug (case-insensitive) followed by `": "`, strip everything up to and including that `": "`. Match the full slug only — no sub-word splitting. If `model.name` has no such prefix, return it unchanged. Example: `"Qwen: Qwen Plus 0728"` with slug `qwen` → `"Qwen Plus 0728"`. `"Claude 3.5 Sonnet"` with slug `anthropic` → unchanged.

**Negative pricing** (value < 0): Display `"variable"` in italic in both price cells. Affects Auto Router which returns `-1` as a sentinel for dynamic pricing.

**Zero pricing** (both prompt and completion parse to `0` via `parseFloat`): Treat as free — show Free badge on the name, show `"—"` in both price cells. Affects Free Models Router. If only one of the two parses to `0` and the other is non-zero, display both prices normally (no Free badge, no dashes). Use `parseFloat(value) === 0` rather than string equality to handle `"0"`, `"0.0"`, `"0.00"` etc.

**Free suffix** (model ID ends with `:free`): Existing logic — show Free badge, show `"—"` in price cells.

**Context filter options:** Any / ≥ 8k / ≥ 32k / ≥ 128k / ≥ 200k / ≥ 1M (adds 200k and 1M to existing options).

### Close

The dialog can be closed via: ✕ button in title bar, Esc key, or click on backdrop. All three emit the same `close` event.

---

## 2. Consistent Close Button on All Modals

All six modal windows receive a title bar with a ✕ button on the right:

- `ModelBrowserDialog.vue`
- `AgentWizard.vue`
- `HumanNameModal.vue`
- `DeleteAgentModal.vue`
- `RequestInspectionModal.vue`
- `SettingsModal.vue`

### Pattern

Each modal's title bar becomes a flex row: `<title text>` on the left, `<✕ button>` on the right. The button triggers the same close action as clicking the backdrop or pressing Esc. The visual style is consistent across all modals.

---

## 3. New Agent Creation Flow

### Current flow

"+" button → AgentWizard (with ModelCard showing placeholder) → user clicks "Change" → ModelBrowserDialog

### New flow

"+" button → ModelBrowserDialog opens immediately → user selects a model → AgentWizard opens with that model pre-filled → user fills name/system prompt → Save

- If user closes ModelBrowserDialog without selecting → nothing happens (wizard does not open)
- The "Change" button on ModelCard inside AgentWizard remains, allowing model change after initial selection
- Editing an existing agent: unchanged — AgentWizard opens directly with the saved model

### Implementation note

The trigger point is `ParticipantsPanel.vue` — the component that owns the "+" button for adding a new agent. It currently sets `ui.showAgentWizard = true` with no selected agent. In the new flow it instead opens a standalone `ModelBrowserDialog` (controlled by a local `showModelBrowser` ref in `ParticipantsPanel`). On model selection, it sets `ui.preselectedModelId` (a new `string | null` field on `useUiStore`, initialized to `null`, reset to `null` in both `reset()` and `resetChatScopedState()`), closes the browser, then sets `ui.showAgentWizard = true`. `AgentWizard` is unconditionally mounted in `MultiAgentChat.vue` — the `v-if` is on the inner root `<div>`, not on the component tag, so the component instance lives for the app's lifetime. Consume `preselectedModelId` in the existing `watch(() => ui.showAgentWizard, ...)` handler (lines 139-146): when `isOpen` is true and `agent.value` is null and `ui.preselectedModelId` is non-null, set `modelId.value = ui.preselectedModelId` then clear `ui.preselectedModelId = null`. Vendor dedup comparison: `name.toLowerCase().startsWith(slug + ': ')`.

**API key gate:** Before opening ModelBrowserDialog, check `isApiKeyPresent`. If no key is configured, open AgentWizard directly (it already shows the "go to settings" message in that case). Only when an API key is present does the new "browser first" flow apply.

**Model fetching:** `modelsStore.fetchModels()` is called when ModelBrowserDialog mounts (already has a 5-minute cache, so safe to call eagerly). The wizard watcher that currently calls `fetchModels()` on wizard open can be removed or left as a no-op fallback.

**Sorting:** Column sort state lives entirely in `ModelBrowserDialog` as local reactive state (`sortKey` + `sortDir`). The `filtered` computed property applies sort on top of the store's data. The store sort order is unchanged. Sort state resets on every mount of `ModelBrowserDialog` (both in the standalone browser-first path and when reopened via "Change" inside the wizard) — this is intentional; no persistence across opens.

---

## Out of Scope

- Pagination or virtual scrolling (the model list is manageable at current size)
- Model detail/preview panel
- Persisting sort/filter state across sessions
