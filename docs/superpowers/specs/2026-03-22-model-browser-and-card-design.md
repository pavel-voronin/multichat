# Model Browser & Model Card — Design Spec

**Date:** 2026-03-22
**Status:** Approved

---

## Overview

Replace the current inline `<select>` model picker in `AgentWizard` with:
1. A compact **ModelCard** showing the selected model's metadata inline in the form
2. A **ModelBrowserDialog** — a full separate modal with sidebar filters and a searchable list
3. A dedicated **`useModelsStore`** (Pinia) for model list state and caching
4. Removal of the JSON fallback execution mode (all agents run tools-only)

---

## 1. Data Layer

### 1.1 `OpenRouterModel` (types.ts)

Add fields:

```ts
export interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  context_length: number;
  supported_parameters: string[];
}
```

`architecture.modality` is fetched from the API solely for hard filtering inside `listModels()` — it is **not** stored in `OpenRouterModel` or shown in the UI.

### 1.2 `AgentConfig` (types.ts)

Add optional model snapshot saved at agent creation/update time:

```ts
export interface ModelSnapshot {
  contextLength: number;
  supportedParameters: string[];
}

export interface AgentConfig {
  // ...existing fields...
  modelSnapshot?: ModelSnapshot;
}
```

**`AgentConfig.pricing`** (existing field) is kept as-is. It continues to be populated from `OpenRouterModel.pricing` in `AgentWizard.save()` exactly as today. `modelSnapshot` adds new fields on top; it does not replace `pricing`.

Remove `capabilities: AgentCapabilities` entirely (see §6 — fallback removal).

### 1.3 `openrouter.ts` — `listModels()`

Apply two hard filters before returning:
- **Text output only:** `architecture.modality` or `output_modalities` must contain `"text"`
- **Tools required:** `supported_parameters` must include `"tools"`

The raw API response must be extended to parse `architecture` (for the text filter) and `supported_parameters` and `context_length` (stored on the model). `architecture` is used only for filtering and is not stored.

Parse and return `context_length` and `supported_parameters` on each model.

### 1.4 Price display

OpenRouter returns price per token as a small decimal (e.g. `0.0000015`). Multiply by 1,000,000 to display as price per 1M tokens: `$0.10 / $1.50`.

---

## 2. `useModelsStore` (new Pinia store)

**File:** `src/vue/stores/models.ts`

**State:**
```ts
models: OpenRouterModel[]   // filtered list (tools + text only)
isLoading: boolean
error: string | null        // null when no error
lastFetchedAt: number | null  // timestamp ms
```

**Actions:**
- `fetchModels(apiKey: string)` — `AgentWizard` reads the API key from `useAgentsStore` and passes it explicitly. The models store does not depend on any other store — this keeps it independently testable. Skips fetch if `lastFetchedAt` is less than 5 minutes ago.

**Getters:**
- `findById(id: string): OpenRouterModel | undefined`

The store does not depend on `useAgentsStore`. `AgentWizard` calls `fetchModels` when it opens.

---

## 3. `ModelCard.vue` (new component)

**File:** `src/vue/components/ModelCard.vue`

**Props:**
```ts
modelId: string
snapshot?: ModelSnapshot
```

**Behavior:**
- Calls `useModelsStore().findById(modelId)` internally for live data
- If live data available: renders full card
- If only snapshot available: renders with snapshot data
- If neither: renders `modelId` text + Change button only

**Visual (compact row):**
```
[provider / Model Name]  [ctx]k  ·  $X.XX / $X.XX per 1M  [Free]  [Change]
```

- `Free` badge shown when `modelId` ends with `:free`
- No `Vision` or other modality badges (reserved for future)
- `Tools` badge not shown — all displayed models support tools by definition

**Emits:** `change` — parent opens ModelBrowserDialog

---

## 4. `ModelBrowserDialog.vue` (new component)

**File:** `src/vue/components/ModelBrowserDialog.vue`

**Layout:** Teleport to `body`, z-50 (above AgentWizard). Approximately 760px wide.

```
┌─────────────────────────────────────────────────────┐
│  [ Search input                                   ]  │
├────────────┬────────────────────────────────────────┤
│ Filters    │  Provider / Model Name    ctx    in/out per 1M  │
│            │  ──────────────────────────────────────────── │
│ ☐ Free     │  google / Gemini 2.0 Flash  1M   $0.10/$0.40  │
│            │  openai / GPT-4o Mini  128k      $0.15/$0.60  │
│ Context    │  meta / Llama 3.1 70B  128k      Free         │
│ ○ Any      │  ...                                   │
│ ○ ≥ 8k     │                                        │
│ ○ ≥ 32k    │                                        │
│ ● ≥ 128k   │                                        │
└────────────┴────────────────────────────────────────┘
```

**Sidebar filters:**
- `Free only` checkbox — filters `id.endsWith(':free')`
- Context size radio: Any / ≥8k / ≥32k / ≥128k — filters on `context_length`

**Search:** substring match on `model.id` and `model.name` (case-insensitive). Covers provider prefix (e.g. "gpt" finds all OpenAI models).

**Sorting:** grouped by provider (alphabetical), models within provider sorted alphabetically. No user-facing sort controls (YAGNI).

**List row:** provider · model name · context (formatted as `128k` or `1M`) · price per 1M tokens · `Free` badge if applicable.

**Emits:**
- `select(modelId: string)` — user clicked a row
- `close` — backdrop click or Escape

---

## 5. AgentWizard changes

**Remove:**
- Local `models`, `isLoadingModels`, `modelsError`, `showFreeOnly`, `modelSearch` refs
- `visibleModels`, `groupedModels` computed properties
- `loadModels()` function
- `UiSelect` with optgroups, search `UiInput`, free `UiCheckbox`

**Add:**
- `<ModelCard :model-id="modelId" :snapshot="agent?.modelSnapshot" @change="showBrowser = true" />`
- `<ModelBrowserDialog v-if="showBrowser" @select="onModelSelect" @close="showBrowser = false" />`
- On wizard open: `modelsStore.fetchModels(apiKey)`

**`save()` update:** snapshot the selected model before saving:
```ts
const live = modelsStore.findById(modelId.value)
const modelSnapshot = live
  ? { contextLength: live.context_length, supportedParameters: live.supported_parameters }
  : agent.value?.modelSnapshot
```

---

## 6. JSON Fallback Removal

Remove the `'json'` execution mode entirely. All agents run in `'tools'` mode only.

**`src/core/types.ts`:**
- `AgentExecutionMode = 'tools'` (remove `| 'json'`)
- Remove `ToolSupport` type
- Remove `AgentCapabilities` interface
- Remove `capabilities` field from `AgentConfig`
- `RequestTrace.mode` and `RequestTrace.fallback` are kept as-is — they are part of the persistence format and always hold `'tools'` / `false` going forward. `DebugLogEntry.mode` and `DebugLogEntry.fallback` are also kept (optional fields, no change needed).
- Narrowing `AgentExecutionMode` to `'tools'` automatically narrows all usages: `RequestTrace.mode`, `RequestTraceTransportMeta.executionMode`, and `DebugLogEntry.mode`. No structural changes needed in those interfaces; the type narrowing is non-breaking for existing persisted data.

**`src/core/agentProtocol.ts`:**
- Remove `parseJsonAction`
- Remove `mode` parameter from `buildMessages` — always builds tools format

**`src/core/openrouter.ts`:**
- Remove `mode` parameter from `callChatCompletion`
- Remove JSON response-format branch

**Execution logic** (execution.ts / runtime.ts):
- Remove all `prefersTools` / `supportsToolUse` / fallback-switching logic
- Always call `runAgentTurn` with `mode: 'tools'`

**Tests:** remove all `mode: 'json'` cases and `AgentCapabilities` fixtures.

**Storage migration:** existing agents in localStorage have `capabilities: { prefersTools, supportsToolUse }`. These fields are ignored on load — no migration needed.

---

## 7. Out of Scope

- Sorting controls in ModelBrowserDialog
- Modality badges (Vision, Audio) in ModelCard
- Pagination in ModelBrowserDialog (client-side filter is sufficient for ~250 models)
- Model comparison view
