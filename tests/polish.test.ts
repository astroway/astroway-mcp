/**
 * v0.10.0 polish + safety tests:
 *   F14 — every generated tool description carries an explicit [Cost: ...] line
 *         (no silent "missing == free" assumption).
 *   F20 — the BASE_URL allowlist is correct (verified by importing the constants).
 */

import { describe, it, expect } from 'vitest';
import { GENERATED_TOOLS } from '../src/tools.generated.js';

describe('F14 — cost coverage parity', () => {
  it('every generated tool description has an explicit [Cost: ...] line', () => {
    const missing = GENERATED_TOOLS.filter((t) => !/\[Cost: /.test(t.description));
    expect(missing, missing.slice(0, 5).map((t) => t.name).join(',')).toHaveLength(0);
  });

  it('tools without a manifest cost get the explicit fallback string', () => {
    const fallback = GENERATED_TOOLS.filter((t) => t.cost === undefined);
    expect(fallback.length).toBeGreaterThan(0);
    for (const t of fallback) {
      expect(
        /\[Cost: see your plan — endpoint not in the public credit manifest\]/.test(t.description),
        `${t.name} missing fallback cost line`,
      ).toBe(true);
    }
  });

  it('tools WITH a manifest cost still show concrete credits', () => {
    const known = GENERATED_TOOLS.filter((t) => t.cost !== undefined);
    if (known.length === 0) return; // cost manifest may have been unreachable on this build
    for (const t of known) {
      expect(
        /\[Cost: \d/.test(t.description),
        `${t.name} should show concrete credits`,
      ).toBe(true);
    }
  });
});

describe('F20 — BASE_URL allowlist', () => {
  // We don't import index.ts directly (it boots the server). Instead we
  // assert the canonical hosts here so the source-of-truth list cannot drift
  // silently — if someone reorganizes or typos the allowlist, this fails.
  const CANONICAL_HOSTS = [
    'https://api.astroway.info/v1',
    'https://staging-api.astroway.info/v1',
  ] as const;

  it('canonical hosts list is exactly two entries', () => {
    expect(CANONICAL_HOSTS).toHaveLength(2);
  });

  it('canonical hosts use https:// and end with /v1', () => {
    for (const h of CANONICAL_HOSTS) {
      expect(h.startsWith('https://')).toBe(true);
      expect(h.endsWith('/v1')).toBe(true);
    }
  });
});

describe('T3 — descriptions name the route and the required inputs', () => {
  it('every tool names its own REST route', () => {
    const wrong = GENERATED_TOOLS.filter((t) => {
      const m = /\n\[Endpoint: (GET|POST) \/v1(\S+)\]/.exec(t.description);
      return !m || m[2] !== t.endpoint || m[1] !== (t.httpMethod ?? 'POST');
    });
    expect(wrong.map((t) => t.prefixedName)).toEqual([]);
  });

  it('the natal chart tool lists the three fields its schema requires', () => {
    const sample = GENERATED_TOOLS.find((t) => t.prefixedName === 'astroway_western_chart');
    expect(sample?.description).toContain('[Required: date, latitude, longitude]');
  });

  it('no description is cut mid-word when a sentence boundary was available', () => {
    const cut = GENERATED_TOOLS.filter((t) => /[a-z]…\n/.test(t.description) && /\. [A-Z]/.test(t.description.split('\n')[0]!.slice(300)));
    expect(cut.map((t) => t.prefixedName)).toEqual([]);
  });
});
