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
│ Free only  │ Provider ↑ │ Name ↕ │ Context ↕ │ In ↕ │ Out ↕ │
│            ├────────────┼────────┼───────────┼──────┼───────┤
│ Min context│ anthropic  │ Claude │ 200k      │$3.00 │$15.00 │
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

**Vendor dedup:** Strip leading `"VendorLabel: "` prefix from `model.name` when it matches the provider. Detection: if `model.name` lowercased starts with `providerSlug` (or any word in it) followed by `:` and a space, strip up to and including that `: `. Example: `"Qwen: Qwen Plus 0728"` with provider `qwen` → displays as `"Qwen Plus 0728"`.

**Negative pricing** (value < 0): Display `"variable"` in italic in both price cells. Affects Auto Router which returns `-1` as a sentinel for dynamic pricing.

**Zero pricing** (both prompt and completion are `"0"`): Treat as free — show Free badge on the name, show `"—"` in both price cells. Affects Free Models Router.

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

The trigger point is wherever "create new agent" is initiated (the "+" button handler in `ParticipantsPanel` or wherever `ui.showAgentWizard = true` is called for a new agent). That code instead opens ModelBrowserDialog, and only on model selection does it set the chosen model ID and open the wizard.

---

## Out of Scope

- Pagination or virtual scrolling (the model list is manageable at current size)
- Model detail/preview panel
- Persisting sort/filter state across sessions
