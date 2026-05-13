import { describe, it, expect } from 'vitest';
import { costAnnotation, TIER_TABLE } from '../src/cost-data';

describe('costAnnotation', () => {
  it('formats single-digit credit', () => {
    expect(costAnnotation(5, 'TIER_HALF')).toBe('5 credits (Tier ½)');
  });
  it('formats single credit grammatically', () => {
    expect(costAnnotation(1)).toBe('1 credit');
  });
  it('formats with thousand separator', () => {
    expect(costAnnotation(5000, 'TIER_7')).toContain('5,000 credits (Tier 7)');
  });
  it('adds premium warning when ≥ 1000', () => {
    const result = costAnnotation(5000, 'TIER_7');
    expect(result).toContain('⚠️ Premium');
    expect(result).toContain('50% of free monthly');
  });
  it('adds heavy warning at ≥ 250 (but not premium)', () => {
    const result = costAnnotation(250, 'TIER_5');
    expect(result).toContain('⚠️ Heavy');
    expect(result).not.toContain('Premium');
  });
  it('no warning for cheap calls', () => {
    expect(costAnnotation(10, 'TIER_1')).not.toContain('⚠️');
  });
  it('TIER_TABLE has all 10 tiers', () => {
    const expected = ['TIER_HALF','TIER_1','TIER_2','TIER_3','TIER_4','TIER_4_5','TIER_5','TIER_6','TIER_7','TIER_8'];
    expected.forEach(k => expect(TIER_TABLE[k]).toBeDefined());
  });
});
