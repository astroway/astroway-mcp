/**
 * Credit-cost tier table — mirror of api-calc/src/data/endpoint-costs.ts.
 * Used as fallback when /v1/public/endpoint-costs is unreachable at build time.
 * Source-of-truth table is fetched live during `npm run generate` for accuracy.
 */

export interface TierMeta {
  name: string;
  cost: number;
  description: string;
}

export const TIER_TABLE: Record<string, TierMeta> = {
  'TIER_HALF':   { name: 'Tier ½', cost: 5,    description: 'cached lookups, sub-30ms' },
  'TIER_1':      { name: 'Tier 1', cost: 10,   description: 'simple lookups, <50ms' },
  'TIER_2':      { name: 'Tier 2', cost: 20,   description: 'chart + analysis, 50-200ms' },
  'TIER_3':      { name: 'Tier 3', cost: 50,   description: 'two charts or range scan, 200-500ms' },
  'TIER_4':      { name: 'Tier 4', cost: 100,  description: 'multi-chart scans, AI interpretation, >500ms' },
  'TIER_4_5':    { name: 'Tier 4.5', cost: 250, description: 'reserved deep-compute' },
  'TIER_5':      { name: 'Tier 5', cost: 250,  description: 'AI narratives, rectification trutine' },
  'TIER_6':      { name: 'Tier 6', cost: 500,  description: 'extreme complexity, up to 120s' },
  'TIER_7':      { name: 'Tier 7', cost: 5000, description: 'PDF reports (Puppeteer + storage), A4, 21 locales' },
  'TIER_8':      { name: 'Tier 8', cost: 10000, description: 'reserved premium PDF' },
};

/** Format cost annotation for tool description.
 *  Returns string like "5 credits (Tier ½)" or "5,000 credits (Tier 7) ⚠️ Premium — confirm with user".
 */
export function costAnnotation(cost: number, tierKey?: string): string {
  const tier = tierKey ? TIER_TABLE[tierKey] : null;
  const formatted = cost >= 1000 ? cost.toLocaleString('en-US') : String(cost);
  let line = `${formatted} credit${cost === 1 ? '' : 's'}`;
  if (tier) line += ` (${tier.name})`;
  // Premium warning — Tier 6 (≥500) or anything ≥1000
  if (cost >= 1000) {
    const pctOfFreeMonthly = Math.round((cost / 10000) * 100);
    line += ` ⚠️ Premium — ~${pctOfFreeMonthly}% of free monthly budget. Confirm with user before invoking.`;
  } else if (cost >= 250) {
    line += ` ⚠️ Heavy — confirm with user before invoking.`;
  }
  return line;
}
