import type { TurnOrderingConfig } from '../core';

type TurnOrderingStrategy = TurnOrderingConfig['strategy'];

export interface TurnOrderingOption {
  value: TurnOrderingStrategy;
  label: string;
}

export const TURN_ORDERING_OPTIONS: TurnOrderingOption[] = [
  { value: 'sequential', label: 'Sequential' },
  { value: 'random', label: 'Random' },
  { value: 'cheap_first', label: 'Cheap first' },
  { value: 'expensive_first', label: 'Expensive first' },
  { value: 'keywords', label: 'Keywords' },
  { value: 'manual_order', label: 'Manual order' },
  { value: 'sliding_cycle', label: 'Sliding cycle' },
];
