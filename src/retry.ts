/**
 * Exponential backoff retry for HTTP 429 (rate-limited) and 503 (transient).
 * Returns final response or throws if max attempts reached.
 *
 * Default: 3 attempts with 1s, 2s, 4s delays.
 */

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  retryableStatuses?: ReadonlySet<number>;
}

const DEFAULT_RETRYABLE = new Set([429, 503]);

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {}
): Promise<Response> {
  const max = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 1000;
  const retryable = opts.retryableStatuses ?? DEFAULT_RETRYABLE;

  let lastError: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!retryable.has(res.status) || attempt === max) {
        return res;
      }
      // Honor Retry-After header if present (seconds), else exponential backoff
      const retryAfter = res.headers.get('Retry-After');
      const delay = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 60_000)
        : base * Math.pow(2, attempt - 1);
      await sleep(delay);
    } catch (err) {
      lastError = err;
      if (attempt === max) throw err;
      await sleep(base * Math.pow(2, attempt - 1));
    }
  }
  throw lastError ?? new Error('fetchWithRetry: exhausted');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
