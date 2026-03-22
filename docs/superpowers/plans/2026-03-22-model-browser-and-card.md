# Model Browser & Model Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline `<select>` model picker in AgentWizard with a dedicated ModelBrowserDialog, an inline ModelCard, a `useModelsStore`, and remove the JSON fallback execution mode entirely.

**Architecture:** Three independent changes land together: (1) remove JSON fallback — simplifies core execution to tools-only, (2) extend data types and `listModels()` with filtering — powers the new UI, (3) new Vue components and Pinia store — deliver the UX. Tasks 1–5 are pure core/logic work; Tasks 6–11 are UI work.

**Tech Stack:** Vue 3 + `<script setup>`, Pinia, TypeScript, Tailwind CSS with `@apply` in scoped styles, Vitest, Vue Test Utils

---

> **Pre-existing TS errors:** `runtime.ts` has four unrelated diagnostic errors (lines 465, 634, 656, 736) about `contextWindowSize` / `maxContextMessages` from in-progress refactoring. Do NOT fix these — they are out of scope. Run `npm run typecheck` after each task and only address errors introduced by your own changes.

---

## File Map

**Modified:**
- `src/core/types.ts` — remove `ToolSupport`, `AgentCapabilities`, simplify `AgentExecutionMode`; add `context_length`/`supported_parameters` to `OpenRouterModel`; add `ModelSnapshot`; add `modelSnapshot?` to `AgentConfig`
- `src/core/agentProtocol.ts` — remove `parseJsonAction`, remove `mode` param from `buildMessages`
- `src/core/execution.ts` — remove `chooseAgentMode`, `updateToolSupportOnTab`, entire fallback block
- `src/core/openrouter.ts` — remove `mode` param from `callChatCompletion`, add filtering + new fields to `listModels`
- `tests/core/runtime/helpers.ts` — simplify `createTransport` (remove `mode` param)
- `tests/core/runtime/context-routing.test.ts` — remove `capabilities` from fixtures
- `tests/core/runtime/history.test.ts` — remove `capabilities` from fixtures
- `tests/core/runtime/tabs.test.ts` — remove `capabilities` from fixtures
- `tests/core/runtime/sweeps.test.ts` — remove `capabilities`, remove/replace the JSON-fallback test
- `tests/core/runtime/cost-attribution.test.ts` — remove `capabilities`
- `tests/core/runtime/accounting.test.ts` — remove `capabilities`
- `tests/core/runtime/traces.test.ts` — remove `capabilities`
- `tests/core/runtime/participants.test.ts` — remove `capabilities`
- `tests/core/openrouter.test.ts` — remove `capabilities` and `mode` from fixtures; add `listModels` filtering tests
- `tests/vue/components/multi-agent-chat/helpers.ts` — remove `capabilities`
- `tests/vue/components/multi-agent-chat/composer.test.ts` — remove `capabilities`
- `tests/vue/components/multi-agent-chat/costs.test.ts` — remove `capabilities`
- `tests/vue/components/multi-agent-chat/technical-info.test.ts` — remove `capabilities`
- `tests/vue/components/multi-agent-chat/inspection.test.ts` — remove `capabilities`
- `tests/vue/utils/costing.test.ts` — remove `capabilities`
- `tests/core/storage.test.ts` — remove `capabilities` from stored agent fixtures
- `src/vue/components/AgentWizard.vue` — remove select/search/checkbox, add `<ModelCard>` + `<ModelBrowserDialog>`

**Created:**
- `src/vue/stores/models.ts` — new Pinia store: `models`, `isLoading`, `error`, `lastFetchedAt`, `fetchModels()`, `findById()`
- `src/vue/components/ModelCard.vue` — compact row: provider/name · ctx · price · Free badge · Change button
- `src/vue/components/ModelBrowserDialog.vue` — sidebar filters + searchable list, Teleport to body

---

## Task 1: Remove `AgentCapabilities` and `'json'` mode from types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Make these changes to `src/core/types.ts`**

  Remove the `ToolSupport` type entirely:
  ```ts
  // DELETE this line:
  export type ToolSupport = 'unknown' | 'supported' | 'unsupported';
  ```

  Change `AgentExecutionMode`:
  ```ts
  // BEFORE:
  export type AgentExecutionMode = 'tools' | 'json';
  // AFTER:
  export type AgentExecutionMode = 'tools';
  ```

  Remove `mode` from `OpenRouterTransport.runAgentTurn` input shape in `types.ts`. Since `mode` is now always `'tools'`, it is redundant on the interface:
  ```ts
  // BEFORE:
  export interface OpenRouterTransport {
    listModels(apiKey: string): Promise<OpenRouterModel[]>;
    runAgentTurn(input: {
      apiKey: string;
      context: AgentTurnContext;
      mode: AgentExecutionMode;
      signal?: AbortSignal;
    }): Promise<AgentTurnResult>;
  }

  // AFTER:
  export interface OpenRouterTransport {
    listModels(apiKey: string): Promise<OpenRouterModel[]>;
    runAgentTurn(input: {
      apiKey: string;
      context: AgentTurnContext;
      signal?: AbortSignal;
    }): Promise<AgentTurnResult>;
  }
  ```

  Remove `AgentCapabilities` interface and `capabilities` field from `AgentConfig`:
  ```ts
  // DELETE this interface entirely:
  export interface AgentCapabilities {
    prefersTools: boolean;
    supportsToolUse: ToolSupport;
  }

  // In AgentConfig, DELETE this field:
  //   capabilities: AgentCapabilities;
  ```

  The final `AgentConfig` shape after removal:
  ```ts
  export interface AgentConfig {
    id: string;
    name: string;
    modelId: string;
    isEnabled?: boolean;
    isHidden?: boolean;
    archivedAt?: string | null;
    pricing?: {
      prompt?: string;
      completion?: string;
    };
    systemPrompt: string;
  }
  ```

- [ ] **Step 2: Run typecheck to see what breaks**
  ```bash
  cd /Users/pavel/projects/multichat && npm run typecheck 2>&1 | head -60
  ```
  You will see many errors — that is expected. The next tasks fix them one by one.

---

## Task 2: Simplify `agentProtocol.ts` (remove JSON mode)

**Files:**
- Modify: `src/core/agentProtocol.ts`

- [ ] **Step 1: Remove `mode` param from `buildMessages` and delete the JSON branch**

  ```ts
  // BEFORE signature:
  export function buildMessages(
    context: AgentTurnContext,
    mode: AgentExecutionMode,
  )

  // AFTER signature:
  export function buildMessages(context: AgentTurnContext)
  ```

  Delete the entire `if (mode === 'json') { ... }` block (lines 83–100 approximately). Keep only the tools-format return at the end:
  ```ts
  return [
    {
      role: 'system',
      content: sharedInstructions,
    },
    {
      role: 'user',
      content: `Visible conversation history:\n${visibleHistory}`,
    },
  ];
  ```

- [ ] **Step 2: Remove `parseJsonAction` entirely**

  Delete the entire `parseJsonAction` function (export function parseJsonAction ...) from the file.

  Also remove `AgentExecutionMode` from the import at the top since `buildMessages` no longer needs it:
  ```ts
  // BEFORE:
  import type {
    AgentExecutionMode,
    AgentToolCall,
    AgentTurnContext,
  } from './types';

  // AFTER:
  import type { AgentToolCall, AgentTurnContext } from './types';
  ```

- [ ] **Step 3: Run tests for agentProtocol**
  ```bash
  cd /Users/pavel/projects/multichat && npm test -- tests/core/openrouter.test.ts 2>&1 | tail -20
  ```
  Expected: test passes (it only tests tools mode).

---

## Task 3: Clean up `execution.ts` (remove fallback logic)

**Files:**
- Modify: `src/core/execution.ts`

- [ ] **Step 1: Remove `chooseAgentMode` and `updateToolSupportOnTab` functions**

  Delete the `chooseAgentMode` function (lines 71–79):
  ```ts
  // DELETE entirely:
  export function chooseAgentMode(agent: AgentConfig): AgentExecutionMode {
    if (
      agent.capabilities.prefersTools &&
      agent.capabilities.supportsToolUse !== 'unsupported'
    ) {
      return 'tools';
    }
    return 'json';
  }
  ```

  Delete the `updateToolSupportOnTab` function (lines 81–90):
  ```ts
  // DELETE entirely:
  export function updateToolSupportOnTab(...) { ... }
  ```

- [ ] **Step 2: Replace `chooseAgentMode` call, remove `updateToolSupport` everywhere**

  Find the line:
  ```ts
  const mode = chooseAgentMode(agent);
  ```
  Replace with:
  ```ts
  const mode: AgentExecutionMode = 'tools';
  ```

  Remove `updateToolSupport` completely — from the `handleSuccessfulAgentTurnResultFn` parameter object type, from both call sites (`updateToolSupport: true`, `updateToolSupport: false` or `updateToolSupport: true`), and from the function body where `if (updateToolSupport) { updateToolSupportOnTab(...) }` appears. Do all of this in one pass now so Step 4 has nothing left to clean up.

- [ ] **Step 3: Remove the entire JSON fallback block from the catch handler**

  In the `catch (error)` block of the agent turn execution, find the section starting with:
  ```ts
  if (mode === 'tools') {
    ctx.updateAgent(
      agent.id,
      {
        capabilities: {
          ...agent.capabilities,
          supportsToolUse: 'unsupported',
        },
      },
      tabId,
    );
    // ... ~90 lines of fallback logic ...
  }
  ```
  Delete this entire `if (mode === 'tools') { ... }` block. The catch handler should only log the error and push a runtime error — no fallback attempt.

- [ ] **Step 4: Clean up imports in execution.ts**

  Remove any now-unused imports: `AgentExecutionMode` (if it was imported), `chooseAgentMode` is defined in the file (already deleted). Remove `updateToolSupportOnTab` from exports if it was re-exported.

  Also remove the `updateToolSupport` parameter from `handleSuccessfulAgentTurnResultFn`:
  ```ts
  // Remove from the parameter object:
  //   updateToolSupport: boolean;
  // Remove from the function body:
  //   if (updateToolSupport) { updateToolSupportOnTab(...) }
  ```

- [ ] **Step 5: Run typecheck**
  ```bash
  cd /Users/pavel/projects/multichat && npm run typecheck 2>&1 | grep "execution.ts" | head -10
  ```
  Expected: no errors in execution.ts.

---

## Task 4: Clean up `openrouter.ts` (remove JSON mode from `runAgentTurn`)

**Files:**
- Modify: `src/core/openrouter.ts`

- [ ] **Step 1: Remove `mode` param handling from `callChatCompletion`**

  Change the function signature from:
  ```ts
  async function callChatCompletion(
    apiKey: string,
    context: AgentTurnContext,
    mode: AgentExecutionMode,
    signal?: AbortSignal,
  )
  ```
  To:
  ```ts
  async function callChatCompletion(
    apiKey: string,
    context: AgentTurnContext,
    signal?: AbortSignal,
  )
  ```

  Remove the `mode === 'tools'` / `mode === 'json'` conditional branches in the request payload. The payload always includes tools:
  ```ts
  const requestPayload = {
    model: context.agent.modelId,
    messages: buildMessages(context),  // no mode arg now
    tools: buildTools(),
    tool_choice: 'required',
    parallel_tool_calls: false,
  };
  ```

  The response parsing always calls `parseToolAction` (delete the `mode === 'tools' ? parseToolAction : parseJsonAction` branch).

- [ ] **Step 2: Update `runAgentTurn` to not pass `mode`**

  In the `runAgentTurn` method, the call to `callChatCompletion` no longer passes `mode`:
  ```ts
  return callChatCompletion(input.apiKey, input.context, input.signal);
  ```

  The `mode` field is still on `AgentTurnResult` (it's always `'tools'`), so the return value still satisfies the interface.

- [ ] **Step 3: Run the openrouter test**
  ```bash
  cd /Users/pavel/projects/multichat && npm test -- tests/core/openrouter.test.ts 2>&1 | tail -15
  ```
  Expected: PASS.

---

## Task 5: Update all test fixtures (remove `capabilities`)

**Files:**
- Modify: `tests/core/runtime/helpers.ts`
- Modify: `tests/core/runtime/context-routing.test.ts`
- Modify: `tests/core/runtime/history.test.ts`
- Modify: `tests/core/runtime/sweeps.test.ts`
- Modify: `tests/core/runtime/cost-attribution.test.ts`
- Modify: `tests/core/runtime/accounting.test.ts`
- Modify: `tests/core/runtime/traces.test.ts`
- Modify: `tests/core/runtime/participants.test.ts`
- Modify: `tests/core/runtime/tabs.test.ts`
- Modify: `tests/core/openrouter.test.ts`
- Modify: `tests/vue/components/multi-agent-chat/helpers.ts`
- Modify: `tests/vue/components/multi-agent-chat/composer.test.ts`
- Modify: `tests/vue/components/multi-agent-chat/costs.test.ts`
- Modify: `tests/vue/components/multi-agent-chat/technical-info.test.ts`
- Modify: `tests/vue/components/multi-agent-chat/inspection.test.ts`
- Modify: `tests/vue/utils/costing.test.ts`
- Modify: `tests/core/storage.test.ts`

- [ ] **Step 1: Fix `tests/core/runtime/helpers.ts`**

  Simplify `createTransport` — remove the `mode` param since it's always `'tools'`:
  ```ts
  export function createTransport(
    handler: (agentId: string) => Promise<AgentTurnResult>,
  ): OpenRouterTransport {
    return {
      async listModels() {
        return [];
      },
      async runAgentTurn(input) {
        return handler(input.context.agent.id);
      },
    };
  }
  ```

  Remove `AgentExecutionMode` from imports if present.

  **Important:** After changing the `createTransport` signature, every test file that calls it with a two-argument handler `(agentId, mode) => ...` will break. Go through **all** test files in `tests/core/runtime/` that call `createTransport` and drop the `mode` parameter from the handler argument. For example in `sweeps.test.ts`:
  ```ts
  // BEFORE:
  createTransport(async (_agentId, mode) => { ... })
  // AFTER:
  createTransport(async (_agentId) => { ... })
  ```

- [ ] **Step 2: Remove `capabilities` from every `createAgent` call in test files**

  In every file listed above, find all occurrences of:
  ```ts
  capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
  ```
  and delete that line. The `createAgent` call should just have `name`, `modelId`, `systemPrompt` (and optionally `pricing`).

  Example — a `createAgent` call before and after:
  ```ts
  // BEFORE:
  runtime.createAgent({
    name: 'Alpha',
    modelId: 'model-a',
    systemPrompt: 'prompt',
    capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
  });

  // AFTER:
  runtime.createAgent({
    name: 'Alpha',
    modelId: 'model-a',
    systemPrompt: 'prompt',
  });
  ```

- [ ] **Step 3: Update `tests/core/runtime/sweeps.test.ts` — replace the fallback test**

  Delete the entire `'falls back to json mode when tools fail'` test case (it tests behavior that no longer exists).

  Replace it with a test that verifies a failing tools call is reported as an error (no fallback):
  ```ts
  it('reports error when agent turn fails, no fallback', async () => {
    const runtime = createRuntime({
      transport: createTransport(async () => {
        throw new Error('tool unsupported');
      }),
    });
    runtime.createAgent({
      name: 'Fallback',
      modelId: 'model-a',
      systemPrompt: 'prompt',
    });
    runtime.updateSettings({ openRouterApiKey: 'test-key' });

    await runtime.runAgentSweep('manual');

    expect(
      runtime
        .getDiagnosticsState()
        .errors.some((error) => error.message === 'Agent turn failed'),
    ).toBe(true);
    expect(timelineMessages(runtime)).toHaveLength(0);
  });
  ```

  Also update all remaining `createTransport` calls in sweeps.test.ts to use the new single-param `handler: (agentId: string)` signature.

- [ ] **Step 4: Update `tests/core/openrouter.test.ts`**

  Remove `capabilities` from the `agent` in the fixture:
  ```ts
  agent: {
    id: 'masha',
    name: 'Masha',
    modelId: 'test-model',
    systemPrompt: 'You are concise.',
    // capabilities line removed
  },
  ```

  Remove `mode: 'tools'` from the `runAgentTurn` call (the interface no longer has that field):
  ```ts
  // BEFORE:
  await transport.runAgentTurn({ apiKey: 'test-key', context, mode: 'tools' });
  // AFTER:
  await transport.runAgentTurn({ apiKey: 'test-key', context });
  ```

- [ ] **Step 5: Run all tests**
  ```bash
  cd /Users/pavel/projects/multichat && npm test 2>&1 | tail -30
  ```
  Expected: all tests pass. Fix any remaining `capabilities`-related failures.

- [ ] **Step 6: Commit**
  ```bash
  cd /Users/pavel/projects/multichat && git add -p && git commit -m "refactor: remove JSON fallback mode and AgentCapabilities"
  ```

---

## Task 6: Extend `OpenRouterModel`, add `ModelSnapshot` to types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Extend `OpenRouterModel`**

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

- [ ] **Step 2: Add `ModelSnapshot` and update `AgentConfig`**

  Add after `OpenRouterModel`:
  ```ts
  export interface ModelSnapshot {
    contextLength: number;
    supportedParameters: string[];
  }
  ```

  Add `modelSnapshot?` to `AgentConfig`:
  ```ts
  export interface AgentConfig {
    id: string;
    name: string;
    modelId: string;
    isEnabled?: boolean;
    isHidden?: boolean;
    archivedAt?: string | null;
    pricing?: {
      prompt?: string;
      completion?: string;
    };
    modelSnapshot?: ModelSnapshot;
    systemPrompt: string;
  }
  ```

- [ ] **Step 3: Run typecheck**
  ```bash
  cd /Users/pavel/projects/multichat && npm run typecheck 2>&1 | grep -v "runtime.ts" | head -20
  ```
  Expected: no new errors (existing runtime.ts errors are pre-existing, ignore them).

---

## Task 7: Update `listModels()` — filtering and new fields

**Files:**
- Modify: `src/core/openrouter.ts`
- Modify: `tests/core/openrouter.test.ts`

- [ ] **Step 1: Write failing tests first**

  Add to `tests/core/openrouter.test.ts`:

  ```ts
  describe('OpenRouterHttpTransport.listModels', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function makeModel(overrides: {
      id?: string;
      supportedParameters?: string[];
      modality?: string;
      contextLength?: number;
    }) {
      return {
        id: overrides.id ?? 'provider/model',
        name: 'Model Name',
        pricing: { prompt: '0.000001', completion: '0.000002' },
        context_length: overrides.contextLength ?? 128000,
        supported_parameters: overrides.supportedParameters ?? ['tools'],
        architecture: { modality: overrides.modality ?? 'text->text' },
      };
    }

    function stubListModels(models: ReturnType<typeof makeModel>[]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => ({ data: models }),
        })),
      );
    }

    it('returns context_length and supported_parameters', async () => {
      stubListModels([makeModel({ contextLength: 200000 })]);
      const transport = new OpenRouterHttpTransport();
      const result = await transport.listModels('key');
      expect(result[0]?.context_length).toBe(200000);
      expect(result[0]?.supported_parameters).toEqual(['tools']);
    });

    it('filters out models without tools in supported_parameters', async () => {
      stubListModels([
        makeModel({ id: 'a/with-tools', supportedParameters: ['tools'] }),
        makeModel({ id: 'a/no-tools', supportedParameters: [] }),
        makeModel({ id: 'a/tools-and-more', supportedParameters: ['tools', 'response_format'] }),
      ]);
      const transport = new OpenRouterHttpTransport();
      const result = await transport.listModels('key');
      expect(result.map((m) => m.id)).toEqual(['a/with-tools', 'a/tools-and-more']);
    });

    it('filters out models with non-text output modality', async () => {
      stubListModels([
        makeModel({ id: 'a/text-model', modality: 'text->text' }),
        makeModel({ id: 'a/image-model', modality: 'text->image' }),
        makeModel({ id: 'a/multimodal', modality: 'text+image->text' }),
      ]);
      const transport = new OpenRouterHttpTransport();
      const result = await transport.listModels('key');
      expect(result.map((m) => m.id)).toEqual(['a/text-model', 'a/multimodal']);
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**
  ```bash
  cd /Users/pavel/projects/multichat && npm test -- tests/core/openrouter.test.ts 2>&1 | tail -20
  ```
  Expected: new tests FAIL.

- [ ] **Step 3: Update `listModels()` in `openrouter.ts`**

  Extend the raw payload type to include the new fields:
  ```ts
  const payload = (await response.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      pricing?: { prompt?: string; completion?: string };
      context_length?: number;
      supported_parameters?: string[];
      architecture?: { modality?: string };
    }>;
  };
  ```

  Apply filters and map new fields:
  ```ts
  return (payload.data ?? [])
    .filter((model) => {
      // Hard filter 1: must support tools
      if (!(model.supported_parameters ?? []).includes('tools')) return false;
      // Hard filter 2: output must include text
      const modality = model.architecture?.modality ?? '';
      const outputPart = modality.includes('->') ? modality.split('->')[1] : modality;
      if (outputPart && !outputPart.includes('text')) return false;
      return true;
    })
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      pricing: model.pricing,
      context_length: model.context_length ?? 0,
      supported_parameters: model.supported_parameters ?? [],
    }));
  ```

- [ ] **Step 4: Run tests**
  ```bash
  cd /Users/pavel/projects/multichat && npm test -- tests/core/openrouter.test.ts 2>&1 | tail -20
  ```
  Expected: all tests PASS.

- [ ] **Step 5: Update test helpers that mock `listModels`**

  The `OpenRouterModel` type now requires `context_length` and `supported_parameters`. Update any mock `listModels` returns in test helpers that return model objects without these fields:

  In `tests/core/runtime/helpers.ts`:
  ```ts
  async listModels() {
    return [];
  },
  ```
  This returns an empty array — no change needed.

  In `tests/vue/components/multi-agent-chat/helpers.ts`:
  ```ts
  async listModels() {
    return [{ id: 'model-a:free', name: 'Model A Free', context_length: 128000, supported_parameters: ['tools'] }];
  },
  ```

- [ ] **Step 6: Commit**
  ```bash
  cd /Users/pavel/projects/multichat && git add -p && git commit -m "feat: extend OpenRouterModel with context_length and supported_parameters, add hard filtering"
  ```

---

## Task 8: Create `useModelsStore`

**Files:**
- Create: `src/vue/stores/models.ts`

- [ ] **Step 1: Create the store**

  > **Design note:** The spec proposed `fetchModels(apiKey: string)` for isolated testability. In practice, `MultiChatRuntime.listModels()` already reads the apiKey internally from workspace state — there is no public way to call the transport with an explicit key without going through the runtime. `useModelsStore` therefore calls `runtimeStore.requireRuntime().listModels()` with no apiKey argument, consistent with how `useAgentsStore.listModels()` works. `AgentWizard` calls `modelsStore.fetchModels()` with no arguments. In tests, the runtime is always mocked via `initializeChatApp`, so isolation is maintained.

  ```ts
  import { defineStore } from 'pinia';
  import { ref } from 'vue';
  import type { OpenRouterModel } from '../../core';
  import { useRuntimeStore } from './runtime';

  const CACHE_TTL_MS = 5 * 60 * 1000;

  export const useModelsStore = defineStore('models', () => {
    const runtimeStore = useRuntimeStore();

    const models = ref<OpenRouterModel[]>([]);
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const lastFetchedAt = ref<number | null>(null);

    function findById(id: string): OpenRouterModel | undefined {
      return models.value.find((m) => m.id === id);
    }

    async function fetchModels(): Promise<void> {
      const now = Date.now();
      if (
        lastFetchedAt.value !== null &&
        now - lastFetchedAt.value < CACHE_TTL_MS
      ) {
        return;
      }

      isLoading.value = true;
      error.value = null;

      try {
        const result = await runtimeStore.requireRuntime().listModels();
        models.value = result.slice().sort((a, b) => {
          const aProvider = a.id.split('/')[0] ?? a.id;
          const bProvider = b.id.split('/')[0] ?? b.id;
          const diff = aProvider.localeCompare(bProvider);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        });
        lastFetchedAt.value = Date.now();
      } catch (err) {
        error.value =
          err instanceof Error ? err.message : 'Failed to load models';
      } finally {
        isLoading.value = false;
      }
    }

    return { models, isLoading, error, lastFetchedAt, findById, fetchModels };
  });
  ```

- [ ] **Step 2: Run typecheck**
  ```bash
  cd /Users/pavel/projects/multichat && npm run typecheck 2>&1 | grep "models.ts" | head -10
  ```
  Expected: no errors in models.ts.

- [ ] **Step 3: Commit**
  ```bash
  cd /Users/pavel/projects/multichat && git add src/vue/stores/models.ts && git commit -m "feat: add useModelsStore with 5-minute cache"
  ```

---

## Task 9: Create `ModelCard.vue`

**Files:**
- Create: `src/vue/components/ModelCard.vue`

This is a presentational component that reads live model data from `useModelsStore` and falls back to the `snapshot` prop.

- [ ] **Step 1: Create the component**

  ```vue
  <template>
    <div class="model-card">
      <div class="model-card-info">
        <span class="model-card-name">{{ displayName }}</span>
        <span v-if="contextLabel" class="model-card-sep">·</span>
        <span v-if="contextLabel" class="model-card-meta">{{ contextLabel }}</span>
        <span v-if="priceLabel" class="model-card-sep">·</span>
        <span v-if="priceLabel" class="model-card-meta">{{ priceLabel }}</span>
        <span v-if="isFree" class="model-card-badge-free">Free</span>
      </div>
      <UiButton size="sm" @click="$emit('change')">Change</UiButton>
    </div>
  </template>

  <script setup lang="ts">
  import { computed } from 'vue';
  import type { ModelSnapshot } from '../../core';
  import { useModelsStore } from '../stores/models';
  import UiButton from './ui/UiButton.vue';

  const props = defineProps<{
    modelId: string;
    snapshot?: ModelSnapshot;
  }>();

  defineEmits<{ change: [] }>();

  const modelsStore = useModelsStore();

  const liveModel = computed(() => modelsStore.findById(props.modelId));

  const displayName = computed(() => {
    const model = liveModel.value;
    if (model) {
      const provider = model.id.includes('/') ? model.id.split('/')[0] : null;
      return provider ? `${provider} / ${model.name}` : model.name;
    }
    return props.modelId;
  });

  const contextLength = computed(
    () => liveModel.value?.context_length ?? props.snapshot?.contextLength,
  );

  const contextLabel = computed(() => {
    const len = contextLength.value;
    if (!len) return null;
    if (len >= 1_000_000) return `${Math.round(len / 1_000_000)}M ctx`;
    if (len >= 1_000) return `${Math.round(len / 1_000)}k ctx`;
    return `${len} ctx`;
  });

  const isFree = computed(() => props.modelId.endsWith(':free'));

  const priceLabel = computed(() => {
    if (isFree.value) return null;
    const pricing = liveModel.value?.pricing;
    if (!pricing?.prompt && !pricing?.completion) return null;
    const formatPrice = (raw: string | undefined) => {
      if (!raw) return '?';
      const perMillion = parseFloat(raw) * 1_000_000;
      return `$${perMillion.toFixed(perMillion < 0.01 ? 4 : 2)}`;
    };
    return `${formatPrice(pricing.prompt)} / ${formatPrice(pricing.completion)} per 1M`;
  });
  </script>

  <style scoped>
  @reference "../../styles.css";

  .model-card {
    @apply flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2;
  }

  .model-card-info {
    @apply flex flex-wrap items-center gap-1.5 overflow-hidden;
  }

  .model-card-name {
    @apply truncate font-mono text-[12px] font-semibold text-neutral-900;
  }

  .model-card-sep {
    @apply text-[12px] text-neutral-300;
  }

  .model-card-meta {
    @apply font-mono text-[11px] text-neutral-500;
  }

  .model-card-badge-free {
    @apply rounded-sm bg-green-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-green-800;
  }
  </style>
  ```

- [ ] **Step 2: Run typecheck**
  ```bash
  cd /Users/pavel/projects/multichat && npm run typecheck 2>&1 | grep "ModelCard" | head -10
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**
  ```bash
  cd /Users/pavel/projects/multichat && git add src/vue/components/ModelCard.vue && git commit -m "feat: add ModelCard component"
  ```

---

## Task 10: Create `ModelBrowserDialog.vue`

**Files:**
- Create: `src/vue/components/ModelBrowserDialog.vue`

Layout: Teleport to `body`. Sidebar with Free checkbox + context size radio, plus a scrollable list with search. Emits `select(modelId)` and `close`.

- [ ] **Step 1: Add a price formatting utility function**

  The dialog needs to format per-1M prices for list rows. The same logic as `ModelCard` but simpler (just the input price for the list). Add a helper in the `<script setup>`:

  ```ts
  function formatPricePerM(raw: string | undefined): string {
    if (!raw) return '—';
    const perM = parseFloat(raw) * 1_000_000;
    return `$${perM.toFixed(perM < 0.01 ? 4 : 2)}`;
  }

  function formatCtx(len: number): string {
    if (len >= 1_000_000) return `${Math.round(len / 1_000_000)}M`;
    if (len >= 1_000) return `${Math.round(len / 1_000)}k`;
    return String(len);
  }
  ```

- [ ] **Step 2: Create the component**

  ```vue
  <template>
    <Teleport to="body">
      <div class="browser-backdrop" @click.self="$emit('close')" @keydown.esc.window="$emit('close')">
        <div class="browser-dialog">
          <div class="browser-header">
            <h2 class="browser-title">Select Model</h2>
            <UiInput
              v-model="search"
              class="browser-search"
              type="text"
              placeholder="Search by name or provider…"
              autofocus
            />
          </div>
          <div class="browser-body">
            <!-- Sidebar -->
            <aside class="browser-sidebar">
              <div class="browser-sidebar-section">
                <UiCheckbox v-model="freeOnly">Free only</UiCheckbox>
              </div>
              <div class="browser-sidebar-section">
                <div class="browser-sidebar-label">Min context</div>
                <label
                  v-for="option in contextOptions"
                  :key="option.value"
                  class="browser-radio-row"
                >
                  <input
                    type="radio"
                    :value="option.value"
                    v-model="minContext"
                  />
                  {{ option.label }}
                </label>
              </div>
            </aside>
            <!-- List -->
            <div class="browser-list-wrap">
              <div v-if="modelsStore.isLoading" class="browser-empty">
                Loading models…
              </div>
              <div v-else-if="modelsStore.error" class="browser-error">
                {{ modelsStore.error }}
              </div>
              <div v-else-if="!filtered.length" class="browser-empty">
                No models match your filters.
              </div>
              <template v-else>
                <button
                  v-for="model in filtered"
                  :key="model.id"
                  class="browser-row"
                  @click="$emit('select', model.id)"
                >
                  <div class="browser-row-main">
                    <span class="browser-row-name">{{ model.name }}</span>
                    <span class="browser-row-provider">{{ providerOf(model.id) }}</span>
                  </div>
                  <div class="browser-row-meta">
                    <span>{{ formatCtx(model.context_length) }}</span>
                    <span v-if="model.id.endsWith(':free')" class="browser-badge-free">Free</span>
                    <span v-else class="browser-row-price">
                      {{ formatPricePerM(model.pricing?.prompt) }} / {{ formatPricePerM(model.pricing?.completion) }}
                    </span>
                  </div>
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </template>

  <script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useModelsStore } from '../stores/models';
  import UiCheckbox from './ui/UiCheckbox.vue';
  import UiInput from './ui/UiInput.vue';

  defineEmits<{
    select: [modelId: string];
    close: [];
  }>();

  const modelsStore = useModelsStore();

  const search = ref('');
  const freeOnly = ref(false);
  const minContext = ref(0);

  const contextOptions = [
    { label: 'Any', value: 0 },
    { label: '≥ 8k', value: 8_000 },
    { label: '≥ 32k', value: 32_000 },
    { label: '≥ 128k', value: 128_000 },
  ];

  function providerOf(id: string): string {
    return id.includes('/') ? (id.split('/')[0] ?? id) : id;
  }

  function formatCtx(len: number): string {
    if (len >= 1_000_000) return `${Math.round(len / 1_000_000)}M`;
    if (len >= 1_000) return `${Math.round(len / 1_000)}k`;
    return String(len);
  }

  function formatPricePerM(raw: string | undefined): string {
    if (!raw) return '—';
    const perM = parseFloat(raw) * 1_000_000;
    return `$${perM.toFixed(perM < 0.01 ? 4 : 2)}`;
  }

  const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    return modelsStore.models.filter((model) => {
      if (freeOnly.value && !model.id.endsWith(':free')) return false;
      if (minContext.value && model.context_length < minContext.value) return false;
      if (q) {
        const inId = model.id.toLowerCase().includes(q);
        const inName = model.name.toLowerCase().includes(q);
        if (!inId && !inName) return false;
      }
      return true;
    });
  });
  </script>

  <style scoped>
  @reference "../../styles.css";

  .browser-backdrop {
    @apply fixed inset-0 z-50 flex items-start justify-center bg-neutral-950/20 pt-16 backdrop-blur-sm;
  }

  .browser-dialog {
    @apply flex max-h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-neutral-300 bg-white shadow-xl;
  }

  .browser-header {
    @apply flex items-center gap-3 border-b border-neutral-200 px-4 py-3;
  }

  .browser-title {
    @apply shrink-0 text-[13px] font-semibold text-neutral-900;
  }

  .browser-search {
    @apply flex-1;
  }

  .browser-body {
    @apply flex min-h-0 flex-1;
  }

  .browser-sidebar {
    @apply flex w-40 shrink-0 flex-col gap-4 border-r border-neutral-200 p-4;
  }

  .browser-sidebar-section {
    @apply flex flex-col gap-2;
  }

  .browser-sidebar-label {
    @apply text-[10px] font-semibold uppercase tracking-wide text-neutral-400;
  }

  .browser-radio-row {
    @apply flex cursor-pointer items-center gap-2 font-mono text-[12px] text-neutral-700;
  }

  .browser-list-wrap {
    @apply flex flex-1 flex-col overflow-y-auto;
  }

  .browser-empty {
    @apply p-6 text-center font-mono text-[12px] text-neutral-400;
  }

  .browser-error {
    @apply p-6 text-center font-mono text-[12px] text-red-600;
  }

  .browser-row {
    @apply flex w-full cursor-pointer items-center justify-between gap-4 border-b border-neutral-100 px-4 py-2.5 text-left font-mono transition-colors hover:bg-neutral-50;
  }

  .browser-row:last-child {
    @apply border-b-0;
  }

  .browser-row-main {
    @apply flex flex-col gap-0.5 overflow-hidden;
  }

  .browser-row-name {
    @apply truncate text-[12px] font-medium text-neutral-900;
  }

  .browser-row-provider {
    @apply text-[11px] text-neutral-400;
  }

  .browser-row-meta {
    @apply flex shrink-0 items-center gap-2 font-mono text-[11px] text-neutral-500;
  }

  .browser-badge-free {
    @apply rounded-sm bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800;
  }

  .browser-row-price {
    @apply text-neutral-400;
  }
  </style>
  ```

- [ ] **Step 2: Run typecheck**
  ```bash
  cd /Users/pavel/projects/multichat && npm run typecheck 2>&1 | grep "ModelBrowserDialog" | head -10
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**
  ```bash
  cd /Users/pavel/projects/multichat && git add src/vue/components/ModelBrowserDialog.vue && git commit -m "feat: add ModelBrowserDialog with sidebar filters and search"
  ```

---

## Task 11: Update `AgentWizard.vue` — integrate ModelCard and ModelBrowserDialog

**Files:**
- Modify: `src/vue/components/AgentWizard.vue`

- [ ] **Step 1: Remove old model selection UI from the template**

  In the template, find the `<label class="wizard-field">` block for "Model" which contains `UiInput` (search), `UiSelect`, and `UiCheckbox`. Replace it entirely with:

  ```html
  <div class="wizard-field">
    <span class="wizard-label">Model</span>
    <ModelCard
      :model-id="modelId"
      :snapshot="agent?.modelSnapshot"
      @change="showBrowser = true"
    />
  </div>

  <ModelBrowserDialog
    v-if="showBrowser"
    @select="onModelSelect"
    @close="showBrowser = false"
  />
  ```

  Also remove the loading/error messages that were below the select:
  ```html
  <!-- DELETE: -->
  <p v-if="isLoadingModels" class="wizard-copy">Loading models…</p>
  <p v-else-if="modelsError" class="wizard-error">{{ modelsError }}</p>
  ```

- [ ] **Step 2: Update `<script setup>` — replace old model state with new**

  Remove these imports:
  ```ts
  // DELETE:
  import type { OpenRouterModel } from '../../core';
  ```

  Add new imports:
  ```ts
  import { useModelsStore } from '../stores/models';
  import ModelBrowserDialog from './ModelBrowserDialog.vue';
  import ModelCard from './ModelCard.vue';
  ```

  Remove these local refs (no longer needed):
  ```ts
  // DELETE:
  const models = ref<OpenRouterModel[]>([]);
  const isLoadingModels = ref(false);
  const modelsError = ref('');
  const showFreeOnly = ref(false);
  const modelSearch = ref('');
  ```

  Remove these computed properties:
  ```ts
  // DELETE:
  const visibleModels = computed(() => { ... });
  const groupedModels = computed(() => { ... });
  ```

  Remove the `loadModels()` function.

  Add:
  ```ts
  const modelsStore = useModelsStore();
  const showBrowser = ref(false);

  function onModelSelect(selectedId: string) {
    modelId.value = selectedId;
    showBrowser.value = false;
  }
  ```

- [ ] **Step 3: Update `watch` for wizard open event**

  The existing watch calls `loadModels()` when the wizard opens. Replace that call with `modelsStore.fetchModels()`:

  ```ts
  watch(
    () => ui.showAgentWizard,
    async (isOpen) => {
      if (isOpen && isApiKeyPresent.value) {
        await modelsStore.fetchModels();
      }
    },
  );
  ```

  Similarly in `onMounted`:
  ```ts
  onMounted(async () => {
    if (ui.showAgentWizard && isApiKeyPresent.value) {
      await modelsStore.fetchModels();
    }
  });
  ```

- [ ] **Step 4: Update `save()` to write `modelSnapshot`**

  ```ts
  function save() {
    const liveModel = modelsStore.findById(modelId.value);
    const modelSnapshot = liveModel
      ? {
          contextLength: liveModel.context_length,
          supportedParameters: liveModel.supported_parameters,
        }
      : agent.value?.modelSnapshot;

    const payload = {
      name: name.value.trim(),
      modelId: modelId.value,
      pricing: liveModel?.pricing ?? agent.value?.pricing,
      modelSnapshot,
      systemPrompt: systemPrompt.value.trim(),
    };

    if (agent.value?.id) {
      agentsStore.updateAgent(agent.value.id, payload);
    } else {
      agentsStore.createAgent(payload);
    }

    close();
  }
  ```

  Note: `capabilities` is gone from the `createAgent` call.

- [ ] **Step 5: Remove unused imports and UI components**

  Remove these imports no longer used in the template:
  ```ts
  // DELETE:
  import UiCheckbox from './ui/UiCheckbox.vue';
  import UiSelect from './ui/UiSelect.vue';
  ```

  Keep: `UiButton`, `UiInput` (for name field), `UiTextarea`.

- [ ] **Step 6: Run typecheck and tests**
  ```bash
  cd /Users/pavel/projects/multichat && npm run typecheck 2>&1 | grep -v "runtime.ts" | head -20
  cd /Users/pavel/projects/multichat && npm test 2>&1 | tail -20
  ```
  Expected: no new errors, all tests pass.

- [ ] **Step 7: Final commit**
  ```bash
  cd /Users/pavel/projects/multichat && git add -p && git commit -m "feat: replace AgentWizard model select with ModelCard and ModelBrowserDialog"
  ```
