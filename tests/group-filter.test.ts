/**
 * v1.0.0 ASTROWAY_TOOL_GROUPS + ASTROWAY_READONLY data invariants:
 *   - every generated tool has a parseable `astroway_<prefix>_*` name,
 *   - the LLM_GROUPS allowlist (paid AI groups) names only prefixes
 *     that actually exist in the catalogue,
 *   - the prefix set contains the canonical 5 we promote in README
 *     (western/vedic/tarot/numerology/hd) so a boot with those groups
 *     always registers something.
 *
 * The runtime filter logic itself is exercised by the smoke run during
 * release verification — tests here guard against silent data drift.
 */

import { describe, it, expect } from 'vitest';
import { GENERATED_TOOLS } from '../src/tools.generated.js';

const LLM_GROUPS = ['ai', 'horoscope', 'reports'] as const;
const README_GROUPS = ['western', 'vedic', 'tarot', 'numerology', 'hd'] as const;

function toolPrefix(prefixedName: string): string {
  const parts = prefixedName.split('_');
  return parts.length >= 2 ? parts[1].toLowerCase() : prefixedName.toLowerCase();
}

describe('v1.0.0 group filter — data invariants', () => {
  const allPrefixes = new Set(GENERATED_TOOLS.map((t) => toolPrefix(t.prefixedName)));

  it('every tool has a parseable astroway_<prefix>_* name', () => {
    const broken = GENERATED_TOOLS.filter(
      (t) => !t.prefixedName.startsWith('astroway_') || toolPrefix(t.prefixedName).length === 0,
    );
    expect(broken, broken.slice(0, 3).map((t) => t.prefixedName).join(',')).toHaveLength(0);
  });

  it('LLM_GROUPS members all exist as real prefixes', () => {
    for (const g of LLM_GROUPS) {
      expect(allPrefixes.has(g), `LLM group "${g}" missing from catalogue`).toBe(true);
    }
  });

  it('README-promoted groups all exist in the catalogue', () => {
    for (const g of README_GROUPS) {
      expect(allPrefixes.has(g), `README group "${g}" missing from catalogue`).toBe(true);
    }
  });

  it('READONLY=1 hides at least one tool per LLM group (so the toggle is meaningful)', () => {
    for (const g of LLM_GROUPS) {
      const inGroup = GENERATED_TOOLS.filter((t) => toolPrefix(t.prefixedName) === g);
      expect(inGroup.length, `LLM group "${g}" has no tools — kill the entry`).toBeGreaterThan(0);
    }
  });

  it('catalogue has at least 30 distinct prefixes (sanity)', () => {
    expect(allPrefixes.size).toBeGreaterThanOrEqual(30);
  });
});
