export type TurnOrderingConfig =
  | { strategy: 'sequential' }
  | { strategy: 'cheap_first' }
  | { strategy: 'expensive_first' }
  | { strategy: 'random' }
  | { strategy: 'keywords'; keywords: Record<string, string[]> }
  | { strategy: 'manual_order'; order: string[] }
  | { strategy: 'sliding_cycle'; offset: number };

export const DEFAULT_TURN_ORDERING: TurnOrderingConfig = {
  strategy: 'sequential',
};
