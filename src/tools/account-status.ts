/**
 * astroway_account_status — plan, credit balance and billing period of the calling key.
 * Lets the LLM check budget before invoking expensive endpoints.
 */

import { fetchWithRetry } from '../retry.js';
import { MCP_VERSION } from '../version.js';

// GET /v1/auth/keys/me, the documented key introspection endpoint (/keys/me/usage never existed).
interface KeyMeResponse {
  ok: boolean;
  data?: {
    key_prefix?: string;
    plan: string;
    credits_remaining: number | null;
    credits_total_this_period: number | null;
    period_end?: string;
    status?: string;
    unlimited?: boolean;
    limits?: { per_hour?: number };
  };
  error?: { code?: string; message?: string };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export async function fetchAccountStatus(baseUrl: string, apiKey: string): Promise<string> {
  const url = `${baseUrl}/auth/keys/me`;
  try {
    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'User-Agent': `astroway-mcp/${MCP_VERSION}`,
      },
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as KeyMeResponse;
    if (!res.ok || !json.ok || !json.data) {
      const err = json.error ?? {};
      const hint = res.status === 401 ? '\nVerify your ASTROWAY_API_KEY is set correctly.' : '';
      return `Could not fetch account status: ${err.code ?? res.status} (${err.message ?? 'unknown'}).${hint}`;
    }
    const d = json.data;
    const lines = [`Plan: ${d.plan}`];
    if (d.status && d.status !== 'active') lines.push(`Key status: ${d.status}`);

    if (d.limits?.per_hour) {
      lines.push(`Site key: ${d.limits.per_hour} requests/hour, no credit balance.`);
      return lines.join('\n');
    }
    if (d.unlimited || d.credits_remaining === null || d.credits_total_this_period === null) {
      lines.push('Credits: not metered for this key.');
      return lines.join('\n');
    }

    const total = d.credits_total_this_period;
    const left = d.credits_remaining;
    const pct = total > 0 ? Math.round((left / total) * 100) : 0;
    lines.push(`Credits: ${fmt(left)} of ${fmt(total)} remaining (${pct}%)`);
    lines.push(`Used this period: ${fmt(Math.max(0, total - left))}`);
    if (d.period_end) lines.push(`Period ends: ${d.period_end}`);
    if (pct < 20) {
      lines.push('', 'Low budget: under 20% left. Avoid Heavy and Premium calls (AI, PDF reports, rectification) unless the user asks for them.');
    } else if (pct <= 50) {
      lines.push('', 'About half the budget is left. Heavy and Premium calls cost 5-50% of a small plan each.');
    }
    return lines.join('\n');
  } catch (e: any) {
    return `Account status unavailable: ${e?.message ?? 'network error'}. Tool calls may still work but budget unknown.`;
  }
}
