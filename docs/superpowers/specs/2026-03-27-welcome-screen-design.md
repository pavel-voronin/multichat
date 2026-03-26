# Welcome Screen Design

## Overview

Fill the empty `WelcomeDialog` with an onboarding flow: connect an OpenRouter API key, then either launch a preset chat or close and explore freely.

## Layout

Single screen inside the existing `UiModal`. Two sections separated by a divider:

1. **API key input** — text field + "Connect" button + privacy note
2. **Jump right in** — two preset cards + one "Start exploring" card

Preset cards and model dropdowns are disabled until models are loaded. The "Start exploring" card is always active.

## File Structure

### `src/core/types.ts` — full preset types (for future preset management)

```ts
export interface ChatPresetAgent {
  name: string;
  systemPrompt: string;
  modelId: string;
}

export interface ChatPreset {
  version: 1;
  id: string;
  title: string;
  initialMessage: string;
  agents: ChatPresetAgent[];
}
```

### `src/vue/components/welcome/presets.ts` — welcome-scoped type + data

```ts
import type { ChatPreset, ChatPresetAgent } from '../../../core';

type WelcomeChatPresetAgent = Omit<ChatPresetAgent, 'modelId'>;

export interface WelcomeChatPreset extends Omit<ChatPreset, 'agents'> {
  agents: WelcomeChatPresetAgent[];
}

export const WELCOME_PRESETS: WelcomeChatPreset[] = [
  // 2 presets — content TBD with copywriting pass
];
```

`modelId` is absent from `WelcomeChatPreset` because the user selects a model at launch time. The full `ChatPreset` type in core retains `modelId` for future import/export workflows.

### `src/vue/components/welcome/WelcomeDialog.vue` — thin component

Local reactive state only:
- `draftKey: string` — controlled input value
- `selectedModelId: Record<presetId, string>` — one model selection per preset card
- `isConnecting: boolean` — true while `fetchModels` is in flight

Uses: `modelsStore`, `sessionStore`. No business logic.

### `src/vue/stores/session.ts` — `launchPreset` action

```ts
function launchPreset(preset: WelcomeChatPreset, modelId: string): void {
  const tabId = runtime.value.getWorkspaceState().activeTabId;
  runtime.value.renameTab(tabId, preset.title);
  for (const agent of preset.agents) {
    runtime.value.createAgent({ ...agent, modelId }, tabId);
  }
  // sets draft message for the tab (messageInputStore)
  uiStore.showWelcomeModal = false;
}
```

Repurposes the existing default tab — no new tab is created, no old tab is deleted.

## UI States

| State | Key input | Presets |
|---|---|---|
| Initial | Empty, enabled | Disabled (dimmed) |
| Connecting | Disabled | Disabled |
| Error | Enabled, shows error | Disabled |
| Connected | Shows masked key | Enabled |

## Connect Flow

1. User types key and clicks "Connect"
2. Key is saved immediately via `session.updateRuntimeSettings({ openRouterApiKey })`
3. `modelsStore.fetchModels()` is called
4. On success: model dropdowns populate, preset cards activate
5. On failure: inline error shown under the key input, key is still saved (user can retry)

## Launch Flow

1. User picks a model from the dropdown on a preset card
2. Clicks "Launch"
3. `session.launchPreset(preset, modelId)` runs — renames active tab, creates agents, sets message draft
4. Dialog closes

## Start Exploring

Clicking "Start exploring" calls `ui.showWelcomeModal = false`. Nothing else happens — the default empty tab remains as-is.

## What Is Not In Scope

- Preset import/export (future feature)
- Per-agent model selection (all agents in a preset share the selected model)
- Versioning migration logic (version field is present in the schema but no migration code needed yet)
- Copywriting for preset content (names, prompts, initial messages — separate pass)
