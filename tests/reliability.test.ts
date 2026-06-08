/**
 * v0.9.2 reliability bundle tests:
 *   F15 — loadCostManifest does NOT cache an empty fallback after a network blip.
 *   F18 — generated tool descriptions omit the example body for non-generic kinds.
 *   (F16 keep-alive Agent — verified by import-time installation; runtime effect
 *    is observable only against a live server, not unit-testable cleanly.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadCostManifest, _clearCostCache } from '../src/tools/cost-estimate.js';
import { GENERATED_TOOLS } from '../src/tools.generated.js';

describe('F15 — loadCostManifest cache only on success', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _clearCostCache();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('caches the manifest on success and serves it from cache afterwards', async () => {
    fetchSpy.mockResolvedValue(new Response(
      JSON.stringify({ ok: true, data: { endpoints: { '/chart': { tier: 'TIER_2', cost: 20 } } } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ) as unknown as Response);

    const a = await loadCostManifest('https://api.example/v1');
    const b = await loadCostManifest('https://api.example/v1');
    expect(a.endpoints['/chart']).toBeDefined();
    expect(b).toBe(a);              // same reference — served from cache
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache empty fallback on network failure (next call retries)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    const first = await loadCostManifest('https://api.example/v1');
    expect(first.endpoints).toEqual({});

    // Now the network is back — next call should re-attempt the fetch, not
    // serve the empty fallback from a cache.
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: true, data: { endpoints: { '/chart': { tier: 'TIER_2', cost: 20 } } } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ) as unknown as Response);
    const second = await loadCostManifest('https://api.example/v1');
    expect(second.endpoints['/chart']).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache empty fallback on HTTP 5xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }) as unknown as Response);
    const first = await loadCostManifest('https://api.example/v1');
    expect(first.endpoints).toEqual({});

    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: true, data: { endpoints: { '/x': { tier: 'TIER_1', cost: 10 } } } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ) as unknown as Response);
    const second = await loadCostManifest('https://api.example/v1');
    expect(second.endpoints['/x']).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache empty fallback on envelope ok=false', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: false, error: { code: 'BUSY' } }),
      { status: 200 },
    ) as unknown as Response);
    const first = await loadCostManifest('https://api.example/v1');
    expect(first.endpoints).toEqual({});

    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: true, data: { endpoints: { '/y': { tier: 'TIER_1', cost: 10 } } } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ) as unknown as Response);
    const second = await loadCostManifest('https://api.example/v1');
    expect(second.endpoints['/y']).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('F18 — descriptions drop example body for non-generic kinds', () => {
  it('typed tools have no "Example request body" block', () => {
    const typed = GENERATED_TOOLS.filter((t) => t.schemaKind === 'typed');
    expect(typed.length).toBeGreaterThan(0);
    const withExample = typed.filter((t) => /Example request body/.test(t.description));
    expect(withExample, withExample.map((t) => t.name).join(',')).toHaveLength(0);
  });

  it('chart-shape tools have no example block', () => {
    const charts = GENERATED_TOOLS.filter((t) => t.schemaKind === 'chart');
    expect(charts.length).toBeGreaterThan(0);
    expect(charts.filter((t) => /Example request body/.test(t.description))).toHaveLength(0);
  });

  it('date-shape tools have no example block', () => {
    const dates = GENERATED_TOOLS.filter((t) => t.schemaKind === 'date');
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.filter((t) => /Example request body/.test(t.description))).toHaveLength(0);
  });

  it('generic-fallback tools KEEP the example body (only signal they have)', () => {
    const generics = GENERATED_TOOLS.filter((t) => t.schemaKind === 'generic');
    expect(generics.length).toBeGreaterThan(0);
    // Most generics have an example in their api manifest entry. We assert
    // that AT LEAST ONE retains the example block — the long tail with no
    // example in the manifest still gets nothing, which is fine.
    const withExample = generics.filter((t) => /Example request body/.test(t.description));
    expect(withExample.length).toBeGreaterThan(generics.length * 0.5);
  });
});
