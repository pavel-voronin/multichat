# Configurable Chat Turn Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-chat configurable strategy that determines the order agents receive turns in a sweep, with mention boost and private exclusive delivery as global rules.

**Architecture:** New `src/core/turn-ordering/` module with one file per strategy as pure functions; `buildAgentQueue(tab, triggeringMessage)` in `src/core/turn-ordering.ts` orchestrates the 3-step pipeline (private exclusive → strategy → mention boost). `execution.ts` replaces `getActiveAgents()` in the sweep loop with `buildAgentQueue()`. Runtime exposes `updateTurnOrdering()` for the Vue layer.

**Tech Stack:** TypeScript, Vue 3 Composition API `<script setup>`, Vitest, Pinia, TailwindCSS via semantic classes.

**Spec:** `docs/superpowers/specs/2026-03-24-configurable-chat-turn-ordering-design.md`

---

## File Map

### New files
- `src/core/turn-ordering/types.ts` — `TurnOrderingConfig` discriminated union + `DEFAULT_TURN_ORDERING`
- `src/core/turn-ordering/strategies/sequential.ts` — sequential strategy
- `src/core/turn-ordering/strategies/cheap-first.ts` — cheap_first strategy
- `src/core/turn-ordering/strategies/expensive-first.ts` — expensive_first strategy
- `src/core/turn-ordering/strategies/random.ts` — random seeded strategy
- `src/core/turn-ordering/strategies/keywords.ts` — keywords strategy
- `src/core/turn-ordering/strategies/manual-order.ts` — manual_order strategy
- `src/core/turn-ordering/strategies/sliding-cycle.ts` — sliding_cycle strategy
- `src/core/turn-ordering/mention-boost.ts` — mention boost rule
- `src/core/turn-ordering/private-exclusive.ts` — private exclusive delivery rule
- `src/core/turn-ordering.ts` — public `buildAgentQueue()` API
- `src/vue/components/TurnOrderingSettings.vue` — settings UI component
- `tests/core/turn-ordering/sequential.test.ts`
- `tests/core/turn-ordering/cheap-first.test.ts`
- `tests/core/turn-ordering/expensive-first.test.ts`
- `tests/core/turn-ordering/random.test.ts`
- `tests/core/turn-ordering/keywords.test.ts`
- `tests/core/turn-ordering/manual-order.test.ts`
- `tests/core/turn-ordering/sliding-cycle.test.ts`
- `tests/core/turn-ordering/mention-boost.test.ts`
- `tests/core/turn-ordering/private-exclusive.test.ts`
- `tests/core/turn-ordering/build-agent-queue.test.ts`

### Modified files
- `src/core/types.ts` — add `turnOrdering` to `ChatTabState` and `RuntimeState`
- `src/core/workspace.ts` — update `createEmptyTabState` and `normalizeTabState`
- `src/core/execution.ts` — replace `getActiveAgents` in sweep loop with `buildAgentQueue`
- `src/core/runtime.ts` — add `updateTurnOrdering()`, include `turnOrdering` in `buildRuntimeState`, advance sliding_cycle offset after sweep
- `src/vue/components/SettingsModal.vue` — add `TurnOrderingSettings` section
- `src/vue/stores/session.ts` — add `updateTurnOrdering` action
- `tests/core/runtime/sweeps.test.ts` — add integration tests for turn ordering behavior

---

## Task 1: TurnOrderingConfig types

**Files:**
- Create: `src/core/turn-ordering/types.ts`

- [ ] **Write the file**

```typescript
import type { AgentConfig } from '../types';

export type TurnOrderingConfig =
  | { strategy: 'sequential' }
  | { strategy: 'cheap_first' }
  | { strategy: 'expensive_first' }
  | { strategy: 'random' }
  | { strategy: 'keywords'; keywords: Record<string, string[]> }
  | { strategy: 'manual_order'; order: string[] }
  | { strategy: 'sliding_cycle'; offset: number };

export const DEFAULT_TURN_ORDERING: TurnOrderingConfig = { strategy: 'sequential' };
```

- [ ] **Commit**

```bash
git add src/core/turn-ordering/types.ts
git commit -m "feat: add TurnOrderingConfig types"
```

---

## Task 2: Data model — ChatTabState and migration

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/workspace.ts`

- [ ] **Add `turnOrdering` to `ChatTabState` in `src/core/types.ts`**

In the `ChatTabState` interface, add after `entryInspectionIndex`:

```typescript
import type { TurnOrderingConfig } from './turn-ordering/types';

// inside ChatTabState:
turnOrdering: TurnOrderingConfig;
```

Also add `turnOrdering` to `RuntimeState`:
```typescript
import type { TurnOrderingConfig } from './turn-ordering/types';

// inside RuntimeState:
turnOrdering: TurnOrderingConfig;
```

- [ ] **Update `createEmptyTabState` in `src/core/workspace.ts`**

Add import at top:
```typescript
import { DEFAULT_TURN_ORDERING } from './turn-ordering/types';
```

Add to `createEmptyTabState` return value:
```typescript
turnOrdering: DEFAULT_TURN_ORDERING,
```

- [ ] **Update `normalizeTabState` in `src/core/workspace.ts`**

Add to the returned object in `normalizeTabState`:
```typescript
turnOrdering: (tab as any).turnOrdering ?? DEFAULT_TURN_ORDERING,
```

- [ ] **Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/core/types.ts src/core/workspace.ts
git commit -m "feat: add turnOrdering field to ChatTabState and RuntimeState"
```

---

## Task 3: Strategy — sequential

**Files:**
- Create: `src/core/turn-ordering/strategies/sequential.ts`
- Create: `tests/core/turn-ordering/sequential.test.ts`

- [ ] **Write the failing test**

```typescript
// tests/core/turn-ordering/sequential.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core/types';
import { applySequential } from '../../../src/core/turn-ordering/strategies/sequential';

function makeAgent(id: string): AgentConfig {
  return { id, name: id, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

describe('sequential strategy', () => {
  it('returns agents in input order', () => {
    const agents = [makeAgent('a'), makeAgent('b'), makeAgent('c')];
    expect(applySequential(agents)).toEqual(agents);
  });

  it('returns empty array for no agents', () => {
    expect(applySequential([])).toEqual([]);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
npx vitest run tests/core/turn-ordering/sequential.test.ts
```
Expected: FAIL — `applySequential` not found

- [ ] **Write the implementation**

```typescript
// src/core/turn-ordering/strategies/sequential.ts
import type { AgentConfig } from '../../types';

export function applySequential(agents: AgentConfig[]): AgentConfig[] {
  return [...agents];
}
```

- [ ] **Run test to verify it passes**

```bash
npx vitest run tests/core/turn-ordering/sequential.test.ts
```
Expected: PASS

- [ ] **Commit**

```bash
git add src/core/turn-ordering/strategies/sequential.ts tests/core/turn-ordering/sequential.test.ts
git commit -m "feat: add sequential turn ordering strategy"
```

---

## Task 4: Strategies — cheap_first and expensive_first

**Files:**
- Create: `src/core/turn-ordering/strategies/cheap-first.ts`
- Create: `src/core/turn-ordering/strategies/expensive-first.ts`
- Create: `tests/core/turn-ordering/cheap-first.test.ts`
- Create: `tests/core/turn-ordering/expensive-first.test.ts`

The price of an agent is `parseFloat(pricing.prompt ?? '0') + parseFloat(pricing.completion ?? '0')`. Missing or unparseable values are treated as 0. Tie-break preserves input (chat) order.

- [ ] **Write the failing tests**

```typescript
// tests/core/turn-ordering/cheap-first.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core/types';
import { applyCheapFirst } from '../../../src/core/turn-ordering/strategies/cheap-first';

function makeAgent(id: string, prompt: string, completion: string): AgentConfig {
  return {
    id, name: id, modelId: 'model', systemPrompt: '',
    isEnabled: true, isHidden: false,
    pricing: { prompt, completion },
  };
}

function makeAgentNoPricing(id: string): AgentConfig {
  return { id, name: id, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

describe('cheap_first strategy', () => {
  it('sorts agents ascending by price', () => {
    const cheap = makeAgent('cheap', '0.0000001', '0.0000001');
    const mid = makeAgent('mid', '0.000001', '0.000001');
    const expensive = makeAgent('expensive', '0.00001', '0.00001');
    expect(applyCheapFirst([expensive, mid, cheap]).map(a => a.id)).toEqual(['cheap', 'mid', 'expensive']);
  });

  it('agents with missing pricing sort first (treated as 0)', () => {
    const withPrice = makeAgent('priced', '0.000001', '0.000001');
    const noPricing = makeAgentNoPricing('free');
    expect(applyCheapFirst([withPrice, noPricing]).map(a => a.id)).toEqual(['free', 'priced']);
  });

  it('preserves input order on tie', () => {
    const a = makeAgent('a', '0.000001', '0.000001');
    const b = makeAgent('b', '0.000001', '0.000001');
    expect(applyCheapFirst([a, b]).map(a => a.id)).toEqual(['a', 'b']);
  });
});
```

```typescript
// tests/core/turn-ordering/expensive-first.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core/types';
import { applyExpensiveFirst } from '../../../src/core/turn-ordering/strategies/expensive-first';

function makeAgent(id: string, prompt: string, completion: string): AgentConfig {
  return {
    id, name: id, modelId: 'model', systemPrompt: '',
    isEnabled: true, isHidden: false,
    pricing: { prompt, completion },
  };
}

function makeAgentNoPricing(id: string): AgentConfig {
  return { id, name: id, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

describe('expensive_first strategy', () => {
  it('sorts agents descending by price', () => {
    const cheap = makeAgent('cheap', '0.0000001', '0.0000001');
    const expensive = makeAgent('expensive', '0.00001', '0.00001');
    expect(applyExpensiveFirst([cheap, expensive]).map(a => a.id)).toEqual(['expensive', 'cheap']);
  });

  it('agents with missing pricing sort last (treated as 0)', () => {
    const withPrice = makeAgent('priced', '0.000001', '0.000001');
    const noPricing = makeAgentNoPricing('free');
    expect(applyExpensiveFirst([withPrice, noPricing]).map(a => a.id)).toEqual(['priced', 'free']);
  });

  it('preserves input order on tie', () => {
    const a = makeAgent('a', '0.000001', '0.000001');
    const b = makeAgent('b', '0.000001', '0.000001');
    expect(applyExpensiveFirst([a, b]).map(a => a.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Run tests to verify they fail**

```bash
npx vitest run tests/core/turn-ordering/cheap-first.test.ts tests/core/turn-ordering/expensive-first.test.ts
```
Expected: FAIL

- [ ] **Write the implementations**

```typescript
// src/core/turn-ordering/strategies/cheap-first.ts
import type { AgentConfig } from '../../types';

function agentPrice(agent: AgentConfig): number {
  const prompt = parseFloat(agent.pricing?.prompt ?? '0');
  const completion = parseFloat(agent.pricing?.completion ?? '0');
  return (isNaN(prompt) ? 0 : prompt) + (isNaN(completion) ? 0 : completion);
}

export function applyCheapFirst(agents: AgentConfig[]): AgentConfig[] {
  return [...agents].sort((a, b) => agentPrice(a) - agentPrice(b));
}
```

```typescript
// src/core/turn-ordering/strategies/expensive-first.ts
import type { AgentConfig } from '../../types';

function agentPrice(agent: AgentConfig): number {
  const prompt = parseFloat(agent.pricing?.prompt ?? '0');
  const completion = parseFloat(agent.pricing?.completion ?? '0');
  return (isNaN(prompt) ? 0 : prompt) + (isNaN(completion) ? 0 : completion);
}

export function applyExpensiveFirst(agents: AgentConfig[]): AgentConfig[] {
  return [...agents].sort((a, b) => agentPrice(b) - agentPrice(a));
}
```

Note: JavaScript's `Array.sort` is stable (spec-guaranteed since ES2019), so equal elements preserve input order.

- [ ] **Run tests to verify they pass**

```bash
npx vitest run tests/core/turn-ordering/cheap-first.test.ts tests/core/turn-ordering/expensive-first.test.ts
```
Expected: PASS

- [ ] **Commit**

```bash
git add src/core/turn-ordering/strategies/cheap-first.ts src/core/turn-ordering/strategies/expensive-first.ts tests/core/turn-ordering/cheap-first.test.ts tests/core/turn-ordering/expensive-first.test.ts
git commit -m "feat: add cheap_first and expensive_first strategies"
```

---

## Task 5: Strategy — random

**Files:**
- Create: `src/core/turn-ordering/strategies/random.ts`
- Create: `tests/core/turn-ordering/random.test.ts`

Use a seeded Fisher-Yates shuffle with a simple LCG so `sweepCount` produces a reproducible order per sweep.

- [ ] **Write the failing test**

```typescript
// tests/core/turn-ordering/random.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core/types';
import { applyRandom } from '../../../src/core/turn-ordering/strategies/random';

function makeAgent(id: string): AgentConfig {
  return { id, name: id, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

const agents = ['a', 'b', 'c', 'd'].map(makeAgent);

describe('random strategy', () => {
  it('returns all agents', () => {
    const result = applyRandom(agents, 1);
    expect(result).toHaveLength(agents.length);
    expect(result.map(a => a.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('same sweepCount produces same order', () => {
    const r1 = applyRandom(agents, 42);
    const r2 = applyRandom(agents, 42);
    expect(r1.map(a => a.id)).toEqual(r2.map(a => a.id));
  });

  it('different sweepCount typically produces different order', () => {
    // Not guaranteed every time, but across 100 sweeps at least one differs
    const orders = new Set<string>();
    for (let i = 0; i < 100; i++) {
      orders.add(applyRandom(agents, i).map(a => a.id).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
npx vitest run tests/core/turn-ordering/random.test.ts
```
Expected: FAIL

- [ ] **Write the implementation**

```typescript
// src/core/turn-ordering/strategies/random.ts
import type { AgentConfig } from '../../types';

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    // Linear Congruential Generator
    s = ((1664525 * s + 1013904223) | 0) >>> 0;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function applyRandom(agents: AgentConfig[], sweepCount: number): AgentConfig[] {
  return seededShuffle(agents, sweepCount);
}
```

- [ ] **Run test to verify it passes**

```bash
npx vitest run tests/core/turn-ordering/random.test.ts
```
Expected: PASS

- [ ] **Commit**

```bash
git add src/core/turn-ordering/strategies/random.ts tests/core/turn-ordering/random.test.ts
git commit -m "feat: add random seeded turn ordering strategy"
```

---

## Task 6: Strategy — keywords

**Files:**
- Create: `src/core/turn-ordering/strategies/keywords.ts`
- Create: `tests/core/turn-ordering/keywords.test.ts`

Matches keywords case-insensitively against the triggering message content. Agents with a match go first (preserving chat order among them); no match or null message → chat order.

- [ ] **Write the failing test**

```typescript
// tests/core/turn-ordering/keywords.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig, ParticipantMessageEntry } from '../../../src/core/types';
import { applyKeywords } from '../../../src/core/turn-ordering/strategies/keywords';

function makeAgent(id: string): AgentConfig {
  return { id, name: id, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

function makeMessage(content: string): ParticipantMessageEntry {
  return { id: 'm1', kind: 'participant-message', authorId: 'human', content, target: 'public', createdAt: '' };
}

const alpha = makeAgent('alpha');
const beta = makeAgent('beta');
const gamma = makeAgent('gamma');
const agents = [alpha, beta, gamma];
const keywordsConfig: Record<string, string[]> = {
  alpha: ['api', 'frontend'],
  beta: ['database', 'postgres'],
};

describe('keywords strategy', () => {
  it('moves matched agent to front', () => {
    const result = applyKeywords(agents, keywordsConfig, makeMessage('please check the database'));
    expect(result.map(a => a.id)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('multiple matches preserve chat order among matched agents', () => {
    const result = applyKeywords(agents, keywordsConfig, makeMessage('api and postgres are down'));
    expect(result.map(a => a.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('falls back to chat order when no keywords match', () => {
    const result = applyKeywords(agents, keywordsConfig, makeMessage('hello world'));
    expect(result.map(a => a.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('falls back to chat order when triggeringMessage is null', () => {
    const result = applyKeywords(agents, keywordsConfig, null);
    expect(result.map(a => a.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('keyword matching is case-insensitive', () => {
    const result = applyKeywords(agents, keywordsConfig, makeMessage('DATABASE issue'));
    expect(result[0]!.id).toBe('beta');
  });
});
```

- [ ] **Run test to verify it fails**

```bash
npx vitest run tests/core/turn-ordering/keywords.test.ts
```
Expected: FAIL

- [ ] **Write the implementation**

```typescript
// src/core/turn-ordering/strategies/keywords.ts
import type { AgentConfig, ParticipantMessageEntry } from '../../types';

export function applyKeywords(
  agents: AgentConfig[],
  keywords: Record<string, string[]>,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  if (!triggeringMessage) return [...agents];

  const content = triggeringMessage.content.toLowerCase();
  const matched: AgentConfig[] = [];
  const unmatched: AgentConfig[] = [];

  for (const agent of agents) {
    const agentKeywords = keywords[agent.name] ?? [];
    const hasMatch = agentKeywords.some((kw) => content.includes(kw.toLowerCase()));
    if (hasMatch) {
      matched.push(agent);
    } else {
      unmatched.push(agent);
    }
  }

  if (matched.length === 0) return [...agents];
  return [...matched, ...unmatched];
}
```

- [ ] **Run test to verify it passes**

```bash
npx vitest run tests/core/turn-ordering/keywords.test.ts
```
Expected: PASS

- [ ] **Commit**

```bash
git add src/core/turn-ordering/strategies/keywords.ts tests/core/turn-ordering/keywords.test.ts
git commit -m "feat: add keywords turn ordering strategy"
```

---

## Task 7: Strategy — manual_order

**Files:**
- Create: `src/core/turn-ordering/strategies/manual-order.ts`
- Create: `tests/core/turn-ordering/manual-order.test.ts`

Follows the `order` array by agent name (case-insensitive). Agents not in the list are appended in their original (chat) order.

- [ ] **Write the failing test**

```typescript
// tests/core/turn-ordering/manual-order.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core/types';
import { applyManualOrder } from '../../../src/core/turn-ordering/strategies/manual-order';

function makeAgent(id: string, name: string): AgentConfig {
  return { id, name, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

const alpha = makeAgent('id-alpha', 'Alpha');
const beta = makeAgent('id-beta', 'Beta');
const gamma = makeAgent('id-gamma', 'Gamma');
const agents = [alpha, beta, gamma];

describe('manual_order strategy', () => {
  it('follows the specified order', () => {
    const result = applyManualOrder(agents, ['Gamma', 'Alpha', 'Beta']);
    expect(result.map(a => a.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('appends unlisted agents in chat order', () => {
    const result = applyManualOrder(agents, ['Beta']);
    expect(result.map(a => a.name)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('name matching is case-insensitive', () => {
    const result = applyManualOrder(agents, ['gamma', 'ALPHA']);
    expect(result.map(a => a.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('unknown names in order are ignored', () => {
    const result = applyManualOrder(agents, ['Delta', 'Alpha']);
    expect(result.map(a => a.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
npx vitest run tests/core/turn-ordering/manual-order.test.ts
```
Expected: FAIL

- [ ] **Write the implementation**

```typescript
// src/core/turn-ordering/strategies/manual-order.ts
import type { AgentConfig } from '../../types';

export function applyManualOrder(agents: AgentConfig[], order: string[]): AgentConfig[] {
  const lowerOrder = order.map((name) => name.toLowerCase());
  const remaining = [...agents];
  const result: AgentConfig[] = [];

  for (const name of lowerOrder) {
    const idx = remaining.findIndex((a) => a.name.toLowerCase() === name);
    if (idx !== -1) {
      result.push(remaining.splice(idx, 1)[0]!);
    }
  }

  return [...result, ...remaining];
}
```

- [ ] **Run test to verify it passes**

```bash
npx vitest run tests/core/turn-ordering/manual-order.test.ts
```
Expected: PASS

- [ ] **Commit**

```bash
git add src/core/turn-ordering/strategies/manual-order.ts tests/core/turn-ordering/manual-order.test.ts
git commit -m "feat: add manual_order turn ordering strategy"
```

---

## Task 8: Strategy — sliding_cycle

**Files:**
- Create: `src/core/turn-ordering/strategies/sliding-cycle.ts`
- Create: `tests/core/turn-ordering/sliding-cycle.test.ts`

Rotates the agent ring by `offset` positions. Offset 0 = unchanged. Offset 1 = first agent goes to end. And so on.

- [ ] **Write the failing test**

```typescript
// tests/core/turn-ordering/sliding-cycle.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../../../src/core/types';
import { applySlidingCycle } from '../../../src/core/turn-ordering/strategies/sliding-cycle';

function makeAgent(id: string): AgentConfig {
  return { id, name: id, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

const agents = ['a', 'b', 'c', 'd'].map(makeAgent);

describe('sliding_cycle strategy', () => {
  it('offset 0 returns agents in original order', () => {
    expect(applySlidingCycle(agents, 0).map(a => a.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('offset 1 shifts by one', () => {
    expect(applySlidingCycle(agents, 1).map(a => a.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('offset 3 shifts by three', () => {
    expect(applySlidingCycle(agents, 3).map(a => a.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('offset equal to length wraps to original', () => {
    expect(applySlidingCycle(agents, 4).map(a => a.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('handles empty array', () => {
    expect(applySlidingCycle([], 2)).toEqual([]);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
npx vitest run tests/core/turn-ordering/sliding-cycle.test.ts
```
Expected: FAIL

- [ ] **Write the implementation**

```typescript
// src/core/turn-ordering/strategies/sliding-cycle.ts
import type { AgentConfig } from '../../types';

export function applySlidingCycle(agents: AgentConfig[], offset: number): AgentConfig[] {
  if (agents.length === 0) return [];
  const n = agents.length;
  const start = offset % n;
  return [...agents.slice(start), ...agents.slice(0, start)];
}
```

- [ ] **Run test to verify it passes**

```bash
npx vitest run tests/core/turn-ordering/sliding-cycle.test.ts
```
Expected: PASS

- [ ] **Commit**

```bash
git add src/core/turn-ordering/strategies/sliding-cycle.ts tests/core/turn-ordering/sliding-cycle.test.ts
git commit -m "feat: add sliding_cycle turn ordering strategy"
```

---

## Task 9: Private exclusive delivery rule

**Files:**
- Create: `src/core/turn-ordering/private-exclusive.ts`
- Create: `tests/core/turn-ordering/private-exclusive.test.ts`

Returns `[recipient]` when the triggering message is private with a named recipient; returns `null` otherwise (no override).

- [ ] **Write the failing test**

```typescript
// tests/core/turn-ordering/private-exclusive.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig, ParticipantMessageEntry } from '../../../src/core/types';
import { getPrivateExclusiveRecipient } from '../../../src/core/turn-ordering/private-exclusive';

function makeAgent(id: string): AgentConfig {
  return { id, name: id, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

function makeMessage(target: 'public' | 'private', recipientId?: string): ParticipantMessageEntry {
  return { id: 'm1', kind: 'participant-message', authorId: 'human', content: 'hi', target, recipientId, createdAt: '' };
}

const alpha = makeAgent('agent-alpha');
const beta = makeAgent('agent-beta');
const agents = [alpha, beta];

describe('private exclusive delivery', () => {
  it('returns the recipient agent for a private message', () => {
    const result = getPrivateExclusiveRecipient(agents, makeMessage('private', 'agent-beta'));
    expect(result).toEqual([beta]);
  });

  it('returns null for a public message', () => {
    const result = getPrivateExclusiveRecipient(agents, makeMessage('public'));
    expect(result).toBeNull();
  });

  it('returns null when triggeringMessage is null', () => {
    const result = getPrivateExclusiveRecipient(agents, null);
    expect(result).toBeNull();
  });

  it('returns null when recipient is not in active agents', () => {
    const result = getPrivateExclusiveRecipient(agents, makeMessage('private', 'unknown-agent'));
    expect(result).toBeNull();
  });

  it('returns null for private message with no recipientId', () => {
    const result = getPrivateExclusiveRecipient(agents, makeMessage('private', undefined));
    expect(result).toBeNull();
  });
});
```

- [ ] **Run test to verify it fails**

```bash
npx vitest run tests/core/turn-ordering/private-exclusive.test.ts
```
Expected: FAIL

- [ ] **Write the implementation**

```typescript
// src/core/turn-ordering/private-exclusive.ts
import type { AgentConfig, ParticipantMessageEntry } from '../types';

/**
 * Returns [recipient] if the message is private with a known recipient.
 * Returns null if no exclusive delivery applies.
 */
export function getPrivateExclusiveRecipient(
  agents: AgentConfig[],
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] | null {
  if (!triggeringMessage) return null;
  if (triggeringMessage.target !== 'private') return null;
  if (!triggeringMessage.recipientId) return null;

  const recipient = agents.find((a) => a.id === triggeringMessage.recipientId);
  return recipient ? [recipient] : null;
}
```

- [ ] **Run test to verify it passes**

```bash
npx vitest run tests/core/turn-ordering/private-exclusive.test.ts
```
Expected: PASS

- [ ] **Commit**

```bash
git add src/core/turn-ordering/private-exclusive.ts tests/core/turn-ordering/private-exclusive.test.ts
git commit -m "feat: add private exclusive delivery rule"
```

---

## Task 10: Mention boost rule

**Files:**
- Create: `src/core/turn-ordering/mention-boost.ts`
- Create: `tests/core/turn-ordering/mention-boost.test.ts`

Algorithm: find first `:` (before any newline), split prefix by `,`, trim, case-insensitive match against agent names, move matched agents to front.

- [ ] **Write the failing test**

```typescript
// tests/core/turn-ordering/mention-boost.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig, ParticipantMessageEntry } from '../../../src/core/types';
import { applyMentionBoost } from '../../../src/core/turn-ordering/mention-boost';

function makeAgent(id: string, name: string): AgentConfig {
  return { id, name, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

function makeMessage(content: string): ParticipantMessageEntry {
  return { id: 'm1', kind: 'participant-message', authorId: 'human', content, target: 'public', createdAt: '' };
}

const alpha = makeAgent('id-a', 'Alpha');
const beta = makeAgent('id-b', 'Beta');
const gamma = makeAgent('id-g', 'Gamma');
const agents = [alpha, beta, gamma];

describe('mention boost', () => {
  it('boosts single mentioned agent to front', () => {
    const result = applyMentionBoost(agents, makeMessage('Beta: please answer'));
    expect(result.map(a => a.name)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('boosts multiple mentions in order of mention', () => {
    const result = applyMentionBoost(agents, makeMessage('Beta, Alpha: please answer'));
    expect(result.map(a => a.name)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('case-insensitive match', () => {
    const result = applyMentionBoost(agents, makeMessage('BETA: hello'));
    expect(result[0]!.name).toBe('Beta');
  });

  it('no change when no colon in message', () => {
    const result = applyMentionBoost(agents, makeMessage('hello everyone'));
    expect(result.map(a => a.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('no change when colon is after newline', () => {
    const result = applyMentionBoost(agents, makeMessage('hello\nBeta: message'));
    expect(result.map(a => a.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('no change when prefix tokens do not match any agent name', () => {
    const result = applyMentionBoost(agents, makeMessage('Delta: hello'));
    expect(result.map(a => a.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('no change when triggeringMessage is null', () => {
    const result = applyMentionBoost(agents, null);
    expect(result.map(a => a.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('agent names with hyphens are matched', () => {
    const hyphen = makeAgent('id-h', 'Agent-X');
    const result = applyMentionBoost([alpha, hyphen], makeMessage('Agent-X: go'));
    expect(result[0]!.name).toBe('Agent-X');
  });
});
```

- [ ] **Run test to verify it fails**

```bash
npx vitest run tests/core/turn-ordering/mention-boost.test.ts
```
Expected: FAIL

- [ ] **Write the implementation**

```typescript
// src/core/turn-ordering/mention-boost.ts
import type { AgentConfig, ParticipantMessageEntry } from '../types';

export function applyMentionBoost(
  agents: AgentConfig[],
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  if (!triggeringMessage) return [...agents];

  const content = triggeringMessage.content;
  const newlineIndex = content.indexOf('\n');
  const colonIndex = content.indexOf(':');

  if (colonIndex === -1) return [...agents];
  if (newlineIndex !== -1 && newlineIndex < colonIndex) return [...agents];

  const prefix = content.slice(0, colonIndex);
  const tokens = prefix.split(',').map((t) => t.trim().toLowerCase());

  const agentsByLowerName = new Map(agents.map((a) => [a.name.toLowerCase(), a]));

  const boosted: AgentConfig[] = [];
  for (const token of tokens) {
    const agent = agentsByLowerName.get(token);
    if (agent && !boosted.includes(agent)) {
      boosted.push(agent);
    }
  }

  if (boosted.length === 0) return [...agents];

  const boostedIds = new Set(boosted.map((a) => a.id));
  const rest = agents.filter((a) => !boostedIds.has(a.id));
  return [...boosted, ...rest];
}
```

- [ ] **Run test to verify it passes**

```bash
npx vitest run tests/core/turn-ordering/mention-boost.test.ts
```
Expected: PASS

- [ ] **Commit**

```bash
git add src/core/turn-ordering/mention-boost.ts tests/core/turn-ordering/mention-boost.test.ts
git commit -m "feat: add mention boost rule"
```

---

## Task 11: buildAgentQueue orchestrator

**Files:**
- Create: `src/core/turn-ordering.ts`
- Create: `tests/core/turn-ordering/build-agent-queue.test.ts`

Orchestrates: Step 1 (private exclusive) → Step 2 (strategy) → Step 3 (mention boost).

- [ ] **Write the failing test**

```typescript
// tests/core/turn-ordering/build-agent-queue.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentConfig, ChatTabState, ParticipantMessageEntry } from '../../../src/core/types';
import { buildAgentQueue } from '../../../src/core/turn-ordering';

function makeAgent(id: string, name: string): AgentConfig {
  return { id, name, modelId: 'model', systemPrompt: '', isEnabled: true, isHidden: false };
}

function makeTab(agents: AgentConfig[], strategy = 'sequential', extra: Record<string, unknown> = {}): ChatTabState {
  return {
    id: 'tab-1',
    title: 'Test',
    participants: [{ id: 'human', name: 'Human', role: 'human' }],
    agents,
    timeline: [],
    metrics: {},
    execution: { isSweepRunning: false, queuedSweep: false, sweepCount: 1, stopRequested: false },
    requestTraces: {},
    entryInspectionIndex: {},
    turnOrdering: { strategy, ...extra } as any,
  };
}

function makeMessage(content: string, target: 'public' | 'private' = 'public', recipientId?: string): ParticipantMessageEntry {
  return { id: 'm1', kind: 'participant-message', authorId: 'human', content, target, recipientId, createdAt: '' };
}

const alpha = makeAgent('id-a', 'Alpha');
const beta = makeAgent('id-b', 'Beta');
const gamma = makeAgent('id-g', 'Gamma');

describe('buildAgentQueue', () => {
  it('returns all active agents in sequential order by default', () => {
    const tab = makeTab([alpha, beta, gamma]);
    expect(buildAgentQueue(tab, null).map(a => a.id)).toEqual(['id-a', 'id-b', 'id-g']);
  });

  it('skips disabled agents', () => {
    const disabled = { ...beta, isEnabled: false };
    const tab = makeTab([alpha, disabled, gamma]);
    expect(buildAgentQueue(tab, null).map(a => a.id)).toEqual(['id-a', 'id-g']);
  });

  it('applies private exclusive delivery — returns only recipient', () => {
    const tab = makeTab([alpha, beta, gamma]);
    const msg = makeMessage('secret', 'private', 'id-b');
    expect(buildAgentQueue(tab, msg).map(a => a.id)).toEqual(['id-b']);
  });

  it('applies mention boost on top of strategy', () => {
    const tab = makeTab([alpha, beta, gamma]);
    const msg = makeMessage('Gamma, Alpha: hello');
    const result = buildAgentQueue(tab, msg);
    expect(result.map(a => a.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('mention boost does not apply when private exclusive fires', () => {
    const tab = makeTab([alpha, beta, gamma]);
    // Private message to beta with mention of gamma in content
    const msg = makeMessage('Gamma: go', 'private', 'id-b');
    expect(buildAgentQueue(tab, msg).map(a => a.id)).toEqual(['id-b']);
  });
});
```

- [ ] **Run test to verify it fails**

```bash
npx vitest run tests/core/turn-ordering/build-agent-queue.test.ts
```
Expected: FAIL — `buildAgentQueue` not found

- [ ] **Write the implementation**

```typescript
// src/core/turn-ordering.ts
import type { AgentConfig, ChatTabState, ParticipantMessageEntry } from './types';
import { getActiveAgents } from './context-routing';
import { getPrivateExclusiveRecipient } from './turn-ordering/private-exclusive';
import { applyMentionBoost } from './turn-ordering/mention-boost';
import { applySequential } from './turn-ordering/strategies/sequential';
import { applyCheapFirst } from './turn-ordering/strategies/cheap-first';
import { applyExpensiveFirst } from './turn-ordering/strategies/expensive-first';
import { applyRandom } from './turn-ordering/strategies/random';
import { applyKeywords } from './turn-ordering/strategies/keywords';
import { applyManualOrder } from './turn-ordering/strategies/manual-order';
import { applySlidingCycle } from './turn-ordering/strategies/sliding-cycle';

function applyStrategy(
  agents: AgentConfig[],
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  const config = tab.turnOrdering;
  const sweepCount = tab.execution.sweepCount;

  switch (config.strategy) {
    case 'sequential':
      return applySequential(agents);
    case 'cheap_first':
      return applyCheapFirst(agents);
    case 'expensive_first':
      return applyExpensiveFirst(agents);
    case 'random':
      return applyRandom(agents, sweepCount);
    case 'keywords':
      return applyKeywords(agents, config.keywords, triggeringMessage);
    case 'manual_order':
      return applyManualOrder(agents, config.order);
    case 'sliding_cycle':
      return applySlidingCycle(agents, config.offset);
  }
}

export function buildAgentQueue(
  tab: ChatTabState,
  triggeringMessage: ParticipantMessageEntry | null,
): AgentConfig[] {
  const agents = getActiveAgents(tab);

  // Step 1: Private exclusive delivery
  const exclusive = getPrivateExclusiveRecipient(agents, triggeringMessage);
  if (exclusive !== null) return exclusive;

  // Step 2: Base order by strategy
  const ordered = applyStrategy(agents, tab, triggeringMessage);

  // Step 3: Mention boost
  return applyMentionBoost(ordered, triggeringMessage);
}
```

- [ ] **Run test to verify it passes**

```bash
npx vitest run tests/core/turn-ordering/build-agent-queue.test.ts
```
Expected: PASS

- [ ] **Run all turn-ordering tests**

```bash
npx vitest run tests/core/turn-ordering/
```
Expected: all PASS

- [ ] **Commit**

```bash
git add src/core/turn-ordering.ts tests/core/turn-ordering/build-agent-queue.test.ts
git commit -m "feat: add buildAgentQueue orchestrator"
```

---

## Task 12: Wire buildAgentQueue into execution.ts

**Files:**
- Modify: `src/core/execution.ts`

Replace `getActiveAgents(currentTab)` in the sweep loop with `buildAgentQueue(currentTab, triggeringMessage)`. The triggering message is the most recent `ParticipantMessageEntry` in the timeline at sweep start.

- [ ] **Write the integration test first** (add to existing file)

In `tests/core/runtime/sweeps.test.ts`, add:

```typescript
it('respects manual_order turn ordering strategy', async () => {
  const order: string[] = [];
  const runtime = createRuntime({
    transport: createTransport(async (agentId) => {
      order.push(agentId);
      return { mode: 'tools', action: { type: 'stay_silent', reason: 'test' } };
    }),
  });

  const gamma = runtime.createAgent({ name: 'Gamma', modelId: 'g', systemPrompt: '' });
  const alpha = runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: '' });
  const beta = runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: '' });

  runtime.updateTurnOrdering({ strategy: 'manual_order', order: ['Beta', 'Alpha', 'Gamma'] });
  runtime.updateSettings({ openRouterApiKey: 'test-key' });
  await runtime.runAgentSweep('manual');

  expect(order).toEqual([beta.id, alpha.id, gamma.id]);
});

it('private exclusive delivery — only recipient runs in sweep', async () => {
  const visited: string[] = [];
  let alphaId = '';
  let betaId = '';
  const runtime = createRuntime({
    transport: createTransport(async (agentId) => {
      visited.push(agentId);
      return { mode: 'tools', action: { type: 'stay_silent', reason: 'test' } };
    }),
  });

  const alpha = runtime.createAgent({ name: 'Alpha', modelId: 'a', systemPrompt: '' });
  const beta = runtime.createAgent({ name: 'Beta', modelId: 'b', systemPrompt: '' });
  alphaId = alpha.id;
  betaId = beta.id;

  runtime.updateSettings({ openRouterApiKey: 'test-key' });

  // Send a private message from human to beta
  await runtime.sendMessage({ senderId: 'human', content: 'private msg', target: 'private', recipientId: betaId, triggerSweep: false });
  await runtime.runAgentSweep('message');

  expect(visited).toEqual([betaId]);
});
```

- [ ] **Run test to verify it fails**

```bash
npx vitest run tests/core/runtime/sweeps.test.ts
```
Expected: FAIL — `runtime.updateTurnOrdering` not found

- [ ] **Update execution.ts**

In `src/core/execution.ts`, add import:

```typescript
import { buildAgentQueue } from './turn-ordering';
```

In `runAgentSweepFn`, inside the `do` loop, replace:

```typescript
for (const agent of getActiveAgents(currentTab)) {
```

with:

```typescript
const triggeringMessage =
  [...currentTab.timeline]
    .reverse()
    .find((e): e is ParticipantMessageEntry => e.kind === 'participant-message') ?? null;

for (const agent of buildAgentQueue(currentTab, triggeringMessage)) {
```

The `getActiveAgents` import from `context-routing` can be removed from `execution.ts` if no longer used there (it remains in `context-routing.ts` for use by `buildAgentQueue`).

- [ ] **Verify existing tests still pass**

```bash
npx vitest run tests/core/runtime/
```
Expected: all pass (except the new tests which still fail since `updateTurnOrdering` doesn't exist yet)

- [ ] **Commit**

```bash
git add src/core/execution.ts
git commit -m "feat: use buildAgentQueue in sweep loop"
```

---

## Task 13: Runtime — updateTurnOrdering, RuntimeState, and sliding_cycle offset

**Files:**
- Modify: `src/core/runtime.ts`

Three changes:
1. Add `updateTurnOrdering()` public method
2. Include `turnOrdering` in `buildRuntimeState()`
3. After each sweep, if strategy is `sliding_cycle` and sweep was not stopped, advance offset

- [ ] **Add import and method to `src/core/runtime.ts`**

Add import at top:
```typescript
import type { TurnOrderingConfig } from './turn-ordering/types';
import { getActiveAgents } from './context-routing';
```

Add public method (near `updateAgent`):
```typescript
updateTurnOrdering(
  config: TurnOrderingConfig,
  tabId = this.workspace.activeTabId,
): void {
  const tab = this.requireTab(tabId);
  tab.turnOrdering = config;
  this.persistAndNotify();
}
```

Update `buildRuntimeState`:
```typescript
private buildRuntimeState(tab: ChatTabState): RuntimeState {
  return deepClone({
    activeTabId: this.workspace.activeTabId,
    participants: tab.participants,
    agents: tab.agents,
    timeline: tab.timeline,
    metrics: tab.metrics,
    settings: this.workspace.settings,
    execution: tab.execution,
    turnOrdering: tab.turnOrdering,
  });
}
```

Update `runAgentSweep` to advance `sliding_cycle` offset:
```typescript
async runAgentSweep(
  trigger: string,
  tabId = this.workspace.activeTabId,
): Promise<void> {
  await runAgentSweepFn(trigger, tabId, this.buildExecutionContext());

  const tab = this.getTab(tabId);
  // `stopRequested` is set to false at the start of each sweep loop iteration
  // (execution.ts line ~421) and only becomes true again if `stop()` is called
  // mid-sweep. A sweep that completed normally will have stopRequested === false
  // here; a stopped sweep will have it === true. This guard is safe.
  if (
    tab &&
    !tab.execution.stopRequested &&
    tab.turnOrdering.strategy === 'sliding_cycle'
  ) {
    const activeCount = getActiveAgents(tab).length;
    if (activeCount > 0) {
      tab.turnOrdering = {
        strategy: 'sliding_cycle',
        offset: (tab.turnOrdering.offset + 1) % activeCount,
      };
      this.persistAndNotify();
    }
  }
}
```

Also add a `sliding_cycle` offset-advance integration test:

```typescript
it('sliding_cycle advances offset by 1 after each sweep', async () => {
  const runtime = createRuntime({
    transport: createTransport(async () => ({
      mode: 'tools',
      action: { type: 'stay_silent', reason: 'test' },
    })),
  });

  runtime.createAgent({ name: 'A', modelId: 'a', systemPrompt: '' });
  runtime.createAgent({ name: 'B', modelId: 'b', systemPrompt: '' });
  runtime.createAgent({ name: 'C', modelId: 'c', systemPrompt: '' });
  runtime.updateTurnOrdering({ strategy: 'sliding_cycle', offset: 0 });
  runtime.updateSettings({ openRouterApiKey: 'test-key' });

  await runtime.runAgentSweep('manual');
  const after1 = runtime.getState().turnOrdering;
  expect(after1).toEqual({ strategy: 'sliding_cycle', offset: 1 });

  await runtime.runAgentSweep('manual');
  const after2 = runtime.getState().turnOrdering;
  expect(after2).toEqual({ strategy: 'sliding_cycle', offset: 2 });

  await runtime.runAgentSweep('manual');
  const after3 = runtime.getState().turnOrdering;
  // wraps: 3 % 3 = 0
  expect(after3).toEqual({ strategy: 'sliding_cycle', offset: 0 });
});
```

- [ ] **Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Run the integration tests**

```bash
npx vitest run tests/core/runtime/sweeps.test.ts
```
Expected: all PASS including new tests

- [ ] **Run full test suite**

```bash
npm test
```
Expected: all PASS

- [ ] **Commit**

```bash
git add src/core/runtime.ts
git commit -m "feat: add updateTurnOrdering to runtime, include in state, advance sliding_cycle offset"
```

---

## Task 14: Vue session store

**Files:**
- Modify: `src/vue/stores/session.ts`

Add `updateTurnOrdering` action that proxies to `runtime.updateTurnOrdering`.

- [ ] **Add the action to `src/vue/stores/session.ts`**

Add import at top:
```typescript
import type { TurnOrderingConfig } from '../../core/turn-ordering/types';
```

Add function inside `defineStore`:
```typescript
function updateTurnOrdering(config: TurnOrderingConfig): void {
  runtime.value.updateTurnOrdering(config);
}
```

Add to the return object:
```typescript
return {
  // ...existing
  updateTurnOrdering,
};
```

- [ ] **Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/vue/stores/session.ts
git commit -m "feat: expose updateTurnOrdering in session store"
```

---

## Task 15: TurnOrderingSettings Vue component

**Files:**
- Create: `src/vue/components/TurnOrderingSettings.vue`

This component renders the strategy dropdown and the conditional parameter UI for each strategy. It reads `state.turnOrdering` from the runtime store and calls `session.updateTurnOrdering()` on change.

For `manual_order`, use the native HTML5 Drag and Drop API. Agents are listed as draggable items; drag events update the local `draftOrder` array.

- [ ] **Write the component**

```vue
<template>
  <div class="turn-ordering-root">
    <label class="turn-ordering-field">
      <span class="turn-ordering-label">Turn ordering</span>
      <UiSelect v-model="draftStrategy" class="turn-ordering-select">
        <option value="sequential">Sequential</option>
        <option value="random">Random</option>
        <option value="cheap_first">Cheap first</option>
        <option value="expensive_first">Expensive first</option>
        <option value="keywords">Keywords</option>
        <option value="manual_order">Manual order</option>
        <option value="sliding_cycle">Sliding cycle</option>
      </UiSelect>
    </label>

    <div v-if="draftStrategy === 'keywords'" class="turn-ordering-params">
      <div
        v-for="agent in activeAgents"
        :key="agent.id"
        class="turn-ordering-keywords-row"
      >
        <span class="turn-ordering-agent-name">{{ agent.name }}</span>
        <UiInput
          :model-value="draftKeywords[agent.name]?.join(', ') ?? ''"
          class="turn-ordering-keywords-input"
          placeholder="keyword1, keyword2"
          @update:model-value="setKeywords(agent.name, $event)"
        />
      </div>
    </div>

    <div v-if="draftStrategy === 'manual_order'" class="turn-ordering-params">
      <div
        v-for="(agent, index) in draftOrder"
        :key="agent.id"
        class="turn-ordering-drag-item"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragover.prevent="onDragOver(index)"
        @drop.prevent="onDrop"
        @dragend="onDragEnd"
      >
        <span class="turn-ordering-drag-handle">⠿</span>
        <span class="turn-ordering-drag-label">{{ agent.name }}</span>
      </div>
    </div>

    <div class="turn-ordering-actions">
      <UiButton class="turn-ordering-save-button" variant="primary" @click="save">
        Save ordering
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRuntimeStore } from '../stores/runtime';
import { useSessionStore } from '../stores/session';
import type { AgentConfig } from '../../core/types';
import type { TurnOrderingConfig } from '../../core/turn-ordering/types';
import UiSelect from './ui/UiSelect.vue';
import UiInput from './ui/UiInput.vue';
import UiButton from './ui/UiButton.vue';

const runtimeStore = useRuntimeStore();
const session = useSessionStore();
const { state } = storeToRefs(runtimeStore);

const activeAgents = computed<AgentConfig[]>(() =>
  state.value.agents.filter((a) => a.isEnabled !== false && a.isHidden !== true),
);

const draftStrategy = ref<TurnOrderingConfig['strategy']>(state.value.turnOrdering.strategy);
const draftKeywords = ref<Record<string, string[]>>({});
const draftOrder = ref<AgentConfig[]>([...activeAgents.value]);

// Sync draft state when the settings panel opens / external state changes
watch(
  () => state.value.turnOrdering,
  (config) => {
    draftStrategy.value = config.strategy;
    if (config.strategy === 'keywords') {
      draftKeywords.value = { ...config.keywords };
    }
    if (config.strategy === 'manual_order') {
      const orderMap = new Map(config.order.map((name, i) => [name.toLowerCase(), i]));
      draftOrder.value = [...activeAgents.value].sort((a, b) => {
        const ai = orderMap.get(a.name.toLowerCase()) ?? Infinity;
        const bi = orderMap.get(b.name.toLowerCase()) ?? Infinity;
        return ai - bi;
      });
    } else {
      draftOrder.value = [...activeAgents.value];
    }
  },
  { immediate: true },
);

function setKeywords(agentName: string, value: string): void {
  draftKeywords.value = {
    ...draftKeywords.value,
    [agentName]: value.split(',').map((s) => s.trim()).filter(Boolean),
  };
}

// Drag-and-drop state
let dragSourceIndex: number | null = null;
let dragOverIndex: number | null = null;

function onDragStart(index: number): void {
  dragSourceIndex = index;
}

function onDragOver(index: number): void {
  dragOverIndex = index;
}

function onDrop(): void {
  if (dragSourceIndex === null || dragOverIndex === null) return;
  if (dragSourceIndex === dragOverIndex) return;
  const items = [...draftOrder.value];
  const [moved] = items.splice(dragSourceIndex, 1);
  items.splice(dragOverIndex, 0, moved!);
  draftOrder.value = items;
}

function onDragEnd(): void {
  dragSourceIndex = null;
  dragOverIndex = null;
}

function save(): void {
  const strategy = draftStrategy.value;

  if (strategy === 'keywords') {
    session.updateTurnOrdering({ strategy: 'keywords', keywords: { ...draftKeywords.value } });
  } else if (strategy === 'manual_order') {
    session.updateTurnOrdering({ strategy: 'manual_order', order: draftOrder.value.map((a) => a.name) });
  } else if (strategy === 'sliding_cycle') {
    // Preserve current offset when re-saving; don't reset it
    const current = state.value.turnOrdering;
    const offset = current.strategy === 'sliding_cycle' ? current.offset : 0;
    session.updateTurnOrdering({ strategy: 'sliding_cycle', offset });
  } else {
    session.updateTurnOrdering({ strategy });
  }
}
</script>

<style scoped>
@reference "../../styles.css";

.turn-ordering-root {
  @apply mt-4 grid gap-3 px-5;
}

.turn-ordering-field {
  @apply grid gap-2;
}

.turn-ordering-label {
  @apply text-[12px] text-neutral-600;
}

.turn-ordering-select {
  @apply w-full;
}

.turn-ordering-params {
  @apply grid gap-2;
}

.turn-ordering-keywords-row {
  @apply flex items-center gap-2;
}

.turn-ordering-agent-name {
  @apply w-24 shrink-0 text-[12px] text-neutral-700;
}

.turn-ordering-keywords-input {
  @apply flex-1;
}

.turn-ordering-drag-item {
  @apply flex cursor-grab items-center gap-2 rounded border border-neutral-200 bg-white px-3 py-2 text-[12px];
}

.turn-ordering-drag-handle {
  @apply text-neutral-400;
}

.turn-ordering-drag-label {
  @apply text-neutral-800;
}

.turn-ordering-actions {
  @apply flex;
}

.turn-ordering-save-button {
  @apply inline-flex;
}
</style>
```

- [ ] **Check if `UiSelect` exists**

```bash
ls src/vue/components/ui/UiSelect.vue
```

If it does not exist, create it following the same pattern as `UiInput.vue`. Check `src/vue/components/ui/UiInput.vue` for the pattern and replicate with a `<select>` element.

- [ ] **Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/vue/components/TurnOrderingSettings.vue
git commit -m "feat: add TurnOrderingSettings Vue component"
```

---

## Task 16: Wire TurnOrderingSettings into SettingsModal

**Files:**
- Modify: `src/vue/components/SettingsModal.vue`

Add a "Turn ordering" section to the settings modal using the new component.

- [ ] **Add the import and component to `SettingsModal.vue`**

In `<script setup>`, add:
```typescript
import TurnOrderingSettings from './TurnOrderingSettings.vue';
```

In the template, add after the "Models cache" `<div class="modal-field">` block and before `<div class="modal-actions">`:

```html
<div class="modal-section-label">
  <span class="modal-label">Turn ordering</span>
</div>
<TurnOrderingSettings />
```

`TurnOrderingSettings` manages its own internal padding, so no `modal-field` wrapper is needed. Add the label style to `<style scoped>`:

```css
.modal-section-label {
  @apply mt-4 px-5;
}
```

- [ ] **Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Run full test suite**

```bash
npm test
```
Expected: all PASS

- [ ] **Commit**

```bash
git add src/vue/components/SettingsModal.vue
git commit -m "feat: add turn ordering settings to SettingsModal"
```

---

## Task 17: Persistence integration test

**Files:**
- Modify: `tests/core/runtime/sweeps.test.ts` (or `tests/core/runtime/persistence.test.ts`)

Add a test confirming that a tab loaded from persisted state without `turnOrdering` defaults to `sequential` without error.

- [ ] **Add the test**

In `tests/core/runtime/persistence.test.ts` or a new block in `sweeps.test.ts`:

```typescript
it('tab loaded without turnOrdering field defaults to sequential', () => {
  // Simulate persisted state from before this feature existed
  const oldTabState = {
    id: 'old-tab',
    title: 'Old Chat',
    // no turnOrdering field
  };

  const runtime = createRuntime({
    initialState: {
      tabs: [oldTabState as any],
      activeTabId: 'old-tab',
    },
  });

  expect(runtime.getState().turnOrdering).toEqual({ strategy: 'sequential' });
});
```

- [ ] **Run test to verify it passes** (it should since Task 2 already adds the migration)

```bash
npm test
```
Expected: all PASS

- [ ] **Commit**

```bash
git add tests/core/runtime/persistence.test.ts
git commit -m "test: verify backward-compat default for turnOrdering"
```

---

## Final verification

- [ ] **Run full test suite**

```bash
npm test
```
Expected: all PASS

- [ ] **Run TypeScript typecheck**

```bash
npm run typecheck
```
Expected: no errors
