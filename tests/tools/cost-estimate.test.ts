import { describe, it, expect } from 'vitest';
import { estimateOne, formatEstimate } from '../../src/tools/cost-estimate';

const manifest = {
  endpoints: {
    '/chart': { tier: 'TIER_2', cost: 20 },
    '/synastry': { tier: 'TIER_3', cost: 50 },
    '/rectification': { tier: 'TIER_6', cost: 500 },
    '/reports/natal': { tier: 'TIER_7', cost: 5000 },
  },
};

describe('estimateOne', () => {
  it('returns cost + tier for known endpoint', () => {
    expect(estimateOne(manifest, '/chart')).toEqual({
      endpoint: '/chart', found: true, cost: 20, tier: 'Tier 2',
    });
  });
  it('normalizes endpoint without leading slash', () => {
    const r = estimateOne(manifest, 'chart');
    expect(r.endpoint).toBe('/chart');
    expect(r.cost).toBe(20);
  });
  it('marks not-found for unknown endpoint', () => {
    expect(estimateOne(manifest, '/unknown')).toEqual({
      endpoint: '/unknown', found: false,
    });
  });
  it('adds heavy warning at 250-999', () => {
    const r = estimateOne(manifest, '/rectification');
    expect(r.warning).toContain('Heavy');
  });
  it('adds premium warning at ≥ 1000 with budget %', () => {
    const r = estimateOne(manifest, '/reports/natal');
    expect(r.warning).toContain('Premium');
    expect(r.warning).toContain('50%');
  });
});

describe('formatEstimate', () => {
  it('formats single endpoint without total', () => {
    const out = formatEstimate([estimateOne(manifest, '/chart')]);
    expect(out).toContain('/chart: 20 credits (Tier 2)');
    expect(out).not.toContain('Total estimate');
  });
  it('formats multiple endpoints with total', () => {
    const out = formatEstimate([
      estimateOne(manifest, '/chart'),
      estimateOne(manifest, '/synastry'),
    ]);
    expect(out).toContain('/chart: 20 credits');
    expect(out).toContain('/synastry: 50 credits');
    expect(out).toContain('Total estimate: 70 credits');
  });
  it('counts unknowns separately', () => {
    const out = formatEstimate([
      estimateOne(manifest, '/chart'),
      estimateOne(manifest, '/unknown'),
    ]);
    expect(out).toContain('Total estimate: 20 credits');
    expect(out).toContain('1 unknown endpoint not counted');
  });
  it('handles empty input', () => {
    expect(formatEstimate([])).toBe('No endpoints requested.');
  });
});
