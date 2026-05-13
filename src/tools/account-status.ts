/**
 * astroway.account_status — surface tier, credit balance, rate-limit status.
 * Lets the LLM check budget before invoking expensive endpoints.
 */

import { fetchWithRetry } from '../retry.js';

interface UsageResponse {
  ok: boolean;
  data?: {
    plan: string;
    is_lifetime: boolean;
    credits_used: number;
    credits_limit: number;
    credits_remaining: number;
    credits_rolled_over?: number;
    rate_limit_per_minute: number;
    cycle_resets_at?: string;
  };
  error?: { code?: string; message?: string };
}

export async function fetchAccountStatus(baseUrl: string, apiKey: string): Promise<string> {
  const url = `${baseUrl}/keys/me/usage`;
  try {
    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'User-Agent': 'astroway-mcp',
      },
    });
    const json = (await res.json()) as UsageResponse;
    if (!res.ok || !json.ok) {
      const err = json.error ?? {};
      return `Could not fetch account status: ${err.code ?? res.status} — ${err.message ?? 'unknown'}.\nVerify your ASTROWAY_API_KEY is set correctly.`;
    }
    const d = json.data!;
    const remaining_pct = d.credits_limit > 0
      ? Math.round((d.credits_remaining / d.credits_limit) * 100)
      : 0;
    const lines = [
      `Plan: ${d.plan}${d.is_lifetime ? ' (lifetime)' : ''}`,
      `Credits: ${d.credits_remaining.toLocaleString('en-US')} of ${d.credits_limit.toLocaleString('en-US')} remaining (${remaining_pct}%)`,
      `Used this cycle: ${d.credits_used.toLocaleString('en-US')}`,
    ];
    if (d.credits_rolled_over && d.credits_rolled_over > 0) {
      lines.push(`Rolled over from previous cycle: ${d.credits_rolled_over.toLocaleString('en-US')}`);
    }
    lines.push(`Rate limit: ${d.rate_limit_per_minute} requests/minute`);
    if (d.cycle_resets_at) {
      lines.push(`Next reset: ${d.cycle_resets_at}`);
    }
    if (remaining_pct < 20) {
      lines.push('', '⚠️ Low budget warning: <20% remaining. Avoid Tier 4+ calls (heavy/AI/PDF reports) unless explicitly requested.');
    } else if (remaining_pct <= 50) {
      lines.push('', 'ℹ️ Mid budget: ~50% remaining. Tier 6/7 (rectification, PDF reports) cost 5-50% per call.');
    }
    return lines.join('\n');
  } catch (e: any) {
    return `Account status unavailable: ${e?.message ?? 'network error'}. Tool calls may still work but budget unknown.`;
  }
}
