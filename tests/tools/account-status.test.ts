import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAccountStatus } from '../../src/tools/account-status';

describe('fetchAccountStatus', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.restoreAllMocks(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('formats successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({
        ok: true,
        data: {
          plan: 'indie',
          is_lifetime: false,
          credits_used: 25000,
          credits_limit: 50000,
          credits_remaining: 25000,
          rate_limit_per_minute: 30,
          cycle_resets_at: '2026-06-01T00:00:00Z',
        },
      }),
      { status: 200 }
    ));
    const promise = fetchAccountStatus('https://api/v1', 'aw_live_test');
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out).toContain('Plan: indie');
    expect(out).toContain('Credits: 25,000 of 50,000 remaining (50%)');
    expect(out).toContain('Rate limit: 30 requests/minute');
    expect(out).toContain('Next reset: 2026-06-01T00:00:00Z');
    expect(out).toContain('Mid budget'); // 50% triggers mid-budget hint
  });

  it('shows lifetime flag for Founders Deal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({
        ok: true,
        data: {
          plan: 'indie', is_lifetime: true,
          credits_used: 0, credits_limit: 50000, credits_remaining: 50000,
          rate_limit_per_minute: 30,
        },
      }),
      { status: 200 }
    ));
    const promise = fetchAccountStatus('https://api/v1', 'aw_live_x');
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out).toContain('Plan: indie (lifetime)');
  });

  it('shows rolled-over credits when present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({
        ok: true,
        data: {
          plan: 'pro', is_lifetime: false,
          credits_used: 100000, credits_limit: 800000, credits_remaining: 700000,
          credits_rolled_over: 200000,
          rate_limit_per_minute: 400,
        },
      }),
      { status: 200 }
    ));
    const promise = fetchAccountStatus('https://api/v1', 'aw_live_y');
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out).toContain('Rolled over from previous cycle: 200,000');
  });

  it('warns about low budget at <20%', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({
        ok: true,
        data: {
          plan: 'indie', is_lifetime: false,
          credits_used: 45000, credits_limit: 50000, credits_remaining: 5000,
          rate_limit_per_minute: 30,
        },
      }),
      { status: 200 }
    ));
    const promise = fetchAccountStatus('https://api/v1', 'aw_live_z');
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out).toContain('Low budget warning');
    expect(out).toContain('Avoid Tier 4+');
  });

  it('returns clear error on auth failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: { code: 'INVALID_KEY', message: 'Key not found' } }),
      { status: 401 }
    ));
    const promise = fetchAccountStatus('https://api/v1', 'bad_key');
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out).toContain('Could not fetch account status');
    expect(out).toContain('INVALID_KEY');
    expect(out).toContain('Verify your ASTROWAY_API_KEY');
  });

  it('handles network error gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'));
    const promise = fetchAccountStatus('https://api/v1', 'aw_live_x');
    await vi.runAllTimersAsync();
    const out = await promise;
    expect(out).toContain('Account status unavailable');
    expect(out).toContain('ENOTFOUND');
  });
});
