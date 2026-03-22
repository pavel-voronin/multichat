import { describe, it, expect } from 'vitest';
import {
  cleanModelName,
  classifyPricing,
  formatPricePerM,
  formatContextLength,
} from '../../../src/vue/utils/modelFormatting';

describe('cleanModelName', () => {
  it('strips matching vendor prefix', () => {
    expect(cleanModelName('Qwen: Qwen Plus 0728', 'qwen/qwen-plus-0728')).toBe('Qwen Plus 0728');
  });
  it('is case-insensitive for slug matching', () => {
    expect(cleanModelName('QWEN: something', 'qwen/model')).toBe('something');
  });
  it('leaves name unchanged when no match', () => {
    expect(cleanModelName('Claude 3.5 Sonnet', 'anthropic/claude-3-5-sonnet')).toBe('Claude 3.5 Sonnet');
  });
  it('leaves name unchanged when prefix does not match slug', () => {
    expect(cleanModelName('Auto Router', 'openrouter/auto')).toBe('Auto Router');
  });
  it('does not strip partial slug matches', () => {
    expect(cleanModelName('Meta: something', 'meta-llama/model')).toBe('Meta: something');
  });
});

describe('classifyPricing', () => {
  it('returns free for :free suffix', () => {
    expect(classifyPricing('0', '0', 'provider/model:free')).toEqual({ kind: 'free' });
  });
  it('returns free when both prices are zero', () => {
    expect(classifyPricing('0', '0', 'openrouter/auto')).toEqual({ kind: 'free' });
  });
  it('returns free for zero with different formats', () => {
    expect(classifyPricing('0.00', '0.0', 'provider/model')).toEqual({ kind: 'free' });
  });
  it('returns variable for negative prompt price', () => {
    expect(classifyPricing('-0.000001', '0', 'openrouter/auto')).toEqual({ kind: 'variable' });
  });
  it('returns variable for negative completion price', () => {
    expect(classifyPricing('0', '-0.000001', 'openrouter/auto')).toEqual({ kind: 'variable' });
  });
  it('returns price for normal pricing', () => {
    expect(classifyPricing('0.000003', '0.000015', 'anthropic/claude')).toEqual({
      kind: 'price',
      input: '$3.00',
      output: '$15.00',
    });
  });
  it('does not treat mixed zero/non-zero as free', () => {
    const result = classifyPricing('0', '0.000001', 'provider/model');
    expect(result.kind).toBe('price');
  });
});

describe('formatPricePerM', () => {
  it('formats normal price', () => {
    expect(formatPricePerM('0.000003')).toBe('$3.00');
  });
  it('uses 4 decimal places for small prices', () => {
    expect(formatPricePerM('0.0000001')).toBe('$0.1000');
  });
  it('returns dash for undefined', () => {
    expect(formatPricePerM(undefined)).toBe('—');
  });
});

describe('formatContextLength', () => {
  it('formats millions', () => {
    expect(formatContextLength(1_000_000)).toBe('1M');
  });
  it('formats thousands', () => {
    expect(formatContextLength(200_000)).toBe('200k');
    expect(formatContextLength(128_000)).toBe('128k');
    expect(formatContextLength(8_000)).toBe('8k');
  });
  it('returns dash for zero or undefined', () => {
    expect(formatContextLength(0)).toBe('—');
    expect(formatContextLength(undefined)).toBe('—');
  });
});
