/**
 * Strip vendor prefix from model name if it matches the provider slug.
 * e.g. "Qwen: Qwen Plus 0728" with slug "qwen" → "Qwen Plus 0728"
 * e.g. "Claude 3.5 Sonnet" with slug "anthropic" → unchanged
 */
export function cleanModelName(name: string, modelId: string): string {
  const slug = modelId.includes('/') ? (modelId.split('/')[0] ?? '') : '';
  if (!slug) return name;
  const prefix = slug + ': ';
  if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
    return name.slice(prefix.length);
  }
  return name;
}

export type PricingDisplay =
  | { kind: 'free' }
  | { kind: 'variable' }
  | { kind: 'price'; input: string; output: string };

/**
 * Classify how to display pricing for a model row.
 * - free suffix OR both prices parse to 0 → { kind: 'free' }
 * - either price is negative → { kind: 'variable' }
 * - otherwise → { kind: 'price', input, output }
 */
export function classifyPricing(
  prompt: string | undefined,
  completion: string | undefined,
  modelId: string,
): PricingDisplay {
  if (modelId.endsWith(':free')) return { kind: 'free' };

  const p = parseFloat(prompt ?? 'NaN');
  const c = parseFloat(completion ?? 'NaN');

  if (!isNaN(p) && p < 0) return { kind: 'variable' };
  if (!isNaN(c) && c < 0) return { kind: 'variable' };

  if (!isNaN(p) && !isNaN(c) && p === 0 && c === 0) return { kind: 'free' };

  return {
    kind: 'price',
    input: formatPricePerM(prompt),
    output: formatPricePerM(completion),
  };
}

/**
 * Format a raw per-token price string to a per-million display string.
 * e.g. "0.000003" → "$3.00", "0.0000001" → "$0.1000", undefined → "—"
 */
export function formatPricePerM(raw: string | undefined): string {
  if (!raw) return '—';
  const perM = parseFloat(raw) * 1_000_000;
  if (isNaN(perM)) return '—';
  // Use 4 decimal places for prices below $1/M to preserve meaningful precision
  return `$${perM.toFixed(perM < 1 ? 4 : 2)}`;
}

/**
 * Format context length to a short string.
 * e.g. 200000 → "200k", 1000000 → "1M", 0/undefined → "—"
 */
export function formatContextLength(len: number | undefined): string {
  if (!len) return '—';
  if (len >= 1_000_000) return `${Math.round(len / 1_000_000)}M`;
  if (len >= 1_000) return `${Math.round(len / 1_000)}k`;
  return String(len);
}
