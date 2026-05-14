/**
 * astroway_cost_estimate — quick lookup of credit cost for one or more endpoints
 * before actually invoking them. Saves the LLM from "fail-cheap-then-retry" loops.
 */

import { TIER_TABLE } from '../cost-data.js';
import { MCP_VERSION } from '../version.js';

interface CostManifest {
  endpoints: Record<string, { tier: string; cost: number }>;
}

let cached: CostManifest | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export async function loadCostManifest(baseUrl: string): Promise<CostManifest> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;
  try {
    const url = `${baseUrl}/public/endpoint-costs`;
    const res = await fetch(url, { headers: { 'User-Agent': `astroway-mcp/${MCP_VERSION}` } });
    if (res.ok) {
      const json = await res.json() as { ok: boolean; data?: CostManifest };
      if (json.ok && json.data) {
        cached = json.data;
        cachedAt = now;
        return cached;
      }
    }
  } catch {
    // fall through to empty fallback
  }
  // Fallback — empty manifest, will return "unknown" per endpoint
  cached = { endpoints: {} };
  cachedAt = now;
  return cached;
}

export interface CostEstimateResult {
  endpoint: string;
  found: boolean;
  cost?: number;
  tier?: string;
  warning?: string;
}

export function estimateOne(manifest: CostManifest, endpoint: string): CostEstimateResult {
  const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const entry = manifest.endpoints[normalized];
  if (!entry) {
    return { endpoint: normalized, found: false };
  }
  const result: CostEstimateResult = {
    endpoint: normalized,
    found: true,
    cost: entry.cost,
    tier: TIER_TABLE[entry.tier]?.name ?? entry.tier,
  };
  if (entry.cost >= 1000) {
    const pct = Math.round((entry.cost / 10000) * 100);
    result.warning = `Premium — ~${pct}% of free monthly budget per call`;
  } else if (entry.cost >= 250) {
    result.warning = `Heavy — confirm with user before invoking`;
  }
  return result;
}

export function formatEstimate(results: CostEstimateResult[]): string {
  if (results.length === 0) return 'No endpoints requested.';
  const lines: string[] = [];
  let total = 0;
  let unknownCount = 0;
  for (const r of results) {
    if (r.found && r.cost !== undefined) {
      const cost = r.cost.toLocaleString('en-US');
      let line = `${r.endpoint}: ${cost} credits${r.tier ? ` (${r.tier})` : ''}`;
      if (r.warning) line += ` ⚠️ ${r.warning}`;
      lines.push(line);
      total += r.cost;
    } else {
      lines.push(`${r.endpoint}: unknown — endpoint not found in manifest`);
      unknownCount++;
    }
  }
  if (results.length > 1) {
    lines.push('');
    lines.push(`Total estimate: ${total.toLocaleString('en-US')} credits`);
    if (unknownCount > 0) {
      lines.push(`(${unknownCount} unknown endpoint${unknownCount === 1 ? '' : 's'} not counted)`);
    }
  }
  return lines.join('\n');
}
