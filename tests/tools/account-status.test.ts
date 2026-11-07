import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAccountStatus } from '../../src/tools/account-status';

// Shapes copied from live GET /v1/auth/keys/me responses (2026-11-07).
const ok = (data: object, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, data }), { status }));

async function run(key = 'aw_live_test') {
  const p = fetchAccountStatus('https://api/v1', key);
  await vi.runAllTimersAsync();
  return p;
}

describe('fetchAccountStatus', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.restoreAllMocks(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('calls the key introspection endpoint that exists', async () => {
    const spy = ok({ plan: 'free', credits_remaining: 10000, credits_total_this_period: 10000 });
    await run();
    expect(String(spy.mock.calls[0][0])).toBe('https://api/v1/auth/keys/me');
  });

  it('formats a metered key', async () => {
    ok({
      key_prefix: 'aw_live_a3f...', plan: 'starter', credits_remaining: 25000,
      credits_total_this_period: 50000, period_end: '2026-12-01T00:00:00.000Z', status: 'active',
    });
    const out = await run();
    expect(out).toContain('Plan: starter');
    expect(out).toContain('Credits: 25,000 of 50,000 remaining (50%)');
    expect(out).toContain('Used this period: 25,000');
    expect(out).toContain('Period ends: 2026-12-01T00:00:00.000Z');
    expect(out).toContain('About half');
    expect(out).not.toContain('Key status');
  });

  it('warns at under 20%', async () => {
    ok({ plan: 'free', credits_remaining: 500, credits_total_this_period: 10000 });
    expect(await run()).toContain('Low budget');
  });

  it('does not report an unmetered key as exhausted', async () => {
    ok({ plan: 'internal', credits_remaining: null, credits_total_this_period: null, unlimited: true });
    const out = await run();
    expect(out).toContain('not metered');
    expect(out).not.toContain('0 of');
  });

  it('describes a site key by its hourly limit', async () => {
    ok({ plan: 'site', credits_remaining: null, credits_total_this_period: null, limits: { per_hour: 300 } });
    expect(await run()).toContain('300 requests/hour');
  });

  it('surfaces a suspended key', async () => {
    ok({ plan: 'free', credits_remaining: 10, credits_total_this_period: 10000, status: 'suspended' });
    expect(await run()).toContain('Key status: suspended');
  });

  it('returns a clear error on auth failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: { code: 'INVALID_KEY', message: 'Key not found' } }),
      { status: 401 },
    ));
    const out = await run('bad_key');
    expect(out).toContain('Could not fetch account status');
    expect(out).toContain('INVALID_KEY');
    expect(out).toContain('Verify your ASTROWAY_API_KEY');
  });

  it('handles a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'));
    const out = await run();
    expect(out).toContain('Account status unavailable');
    expect(out).toContain('ENOTFOUND');
  });
});
