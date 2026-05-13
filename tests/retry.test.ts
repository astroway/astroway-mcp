import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '../src/retry';

describe('fetchWithRetry', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.restoreAllMocks(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('returns 200 immediately without retry', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 })
    );
    const promise = fetchWithRetry('http://test', {});
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 with exponential backoff', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('rl', { status: 429 }))
      .mockResolvedValueOnce(new Response('rl', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const promise = fetchWithRetry('http://test', {}, { maxAttempts: 3, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('honors Retry-After header', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('rl', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const promise = fetchWithRetry('http://test', {}, { maxAttempts: 2, baseDelayMs: 50 });
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
  });

  it('returns last failed response after max attempts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rl', { status: 429 }));
    const promise = fetchWithRetry('http://test', {}, { maxAttempts: 2, baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(429);
  });

  it('does not retry on 4xx (non-rate-limit)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not found', { status: 404 })
    );
    const promise = fetchWithRetry('http://test', {});
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
