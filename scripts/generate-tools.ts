/**
 * Build-time generator: fetch the live AstroWay OpenAPI spec, classify each
 * POST endpoint by input shape, emit `src/tools.generated.ts` for the MCP
 * server to register.
 *
 * Run via `npm run build`.
 *
 * Strategy:
 *   - Fetch OpenAPI from ASTROWAY_OPENAPI_URL (default: prod).
 *   - Iterate POST operations; skip "System" tag (admin/key endpoints) and
 *     ops with no security (public/sandbox duplicates).
 *   - For each surviving op: pick a schema kind from path + JSON example;
 *     fall back to a permissive object schema with the example in the
 *     description so the LLM still has guidance.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OPENAPI_URL = process.env.ASTROWAY_OPENAPI_URL ?? 'https://api.astroway.info/v1/openapi.json';

type SchemaKind =
  | 'chart'
  | 'twoChart'
  | 'chartTarget'
  | 'horoscopeSign'
  | 'horoscopeCompat'
  | 'year'
  | 'date'
  | 'generic';

interface GeneratedTool {
  name: string;
  description: string;
  endpoint: string;
  schemaKind: SchemaKind;
  group: string;
}

interface OpenAPIOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  security?: unknown[];
  requestBody?: {
    content?: {
      'application/json'?: {
        example?: unknown;
      };
    };
  };
}

interface OpenAPIDoc {
  paths: Record<string, Record<string, OpenAPIOperation>>;
}

function sanitizeName(path: string): string {
  return path
    .replace(/^\//, '')
    .replace(/[/-]/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
}

const TWO_CHART_PREFIXES = [
  '/synastry',
  '/composite',
  '/davison',
  '/interpret/synastry',
  '/horoscope/compatibility-personalised',
  '/vedic/compatibility/',
  '/cross/synastry',
];

const CHART_TARGET_HINTS = [
  '/transits',
  '/progressions',
  '/solar-return',
  '/lunar-return',
  '/secondary-progressions',
  '/saturn-return',
  '/transit-calendar',
  '/dashas/',
  '/lunar-phase-day',
  '/at-date',
];

function classify(endpointPath: string, body: string | null): SchemaKind {
  for (const p of TWO_CHART_PREFIXES) {
    if (endpointPath.startsWith(p) || endpointPath === p) return 'twoChart';
  }
  for (const h of CHART_TARGET_HINTS) {
    if (endpointPath.includes(h)) return 'chartTarget';
  }
  if (endpointPath.startsWith('/horoscope/compatibility')) return 'horoscopeCompat';
  if (endpointPath.startsWith('/horoscope/')) return 'horoscopeSign';
  if (body && /"year"\s*:/.test(body) && !/"date"/.test(body)) return 'year';
  if (body && /"date"/.test(body) && !/"latitude"/.test(body) && !/"chart1_date"/.test(body)) return 'date';
  if (body && /"date"/.test(body) && /"time"/.test(body) && /"latitude"/.test(body)) return 'chart';
  return 'generic';
}

function trimDesc(desc: string, max = 380): string {
  const clean = desc.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + '…';
}

function buildDescription(rawDesc: string, body: string | null, group: string): string {
  let out = trimDesc(rawDesc);
  out += `\n\n[Group: ${group}]`;
  if (body && body.trim() && body !== 'null' && body.length < 320) {
    out += `\n\nExample request body: ${body.trim()}`;
  }
  return out;
}

async function main(): Promise<void> {
  console.log(`[generate-tools] fetching OpenAPI from ${OPENAPI_URL}`);
  const res = await fetch(OPENAPI_URL);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const doc = (await res.json()) as OpenAPIDoc;

  const tools: GeneratedTool[] = [];
  const skippedReason: Record<string, number> = {};

  for (const [path, methods] of Object.entries(doc.paths)) {
    const op = methods.post;
    if (!op) {
      skippedReason['non-post'] = (skippedReason['non-post'] ?? 0) + 1;
      continue;
    }
    const tags = op.tags ?? [];
    const group = tags[0] ?? 'Uncategorized';
    if (group === 'System') {
      skippedReason['system-group'] = (skippedReason['system-group'] ?? 0) + 1;
      continue;
    }
    if (!op.security || op.security.length === 0) {
      skippedReason['public-no-auth'] = (skippedReason['public-no-auth'] ?? 0) + 1;
      continue;
    }
    const example = op.requestBody?.content?.['application/json']?.example;
    const body = example != null ? JSON.stringify(example) : null;
    const desc = op.description ?? op.summary ?? '';
    const kind = classify(path, body);
    tools.push({
      name: sanitizeName(path),
      description: buildDescription(desc, body, group),
      endpoint: path,
      schemaKind: kind,
      group,
    });
  }

  const seen = new Map<string, GeneratedTool>();
  for (const t of tools) {
    if (!seen.has(t.name)) seen.set(t.name, t);
  }
  const unique = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));

  const kindCounts = unique.reduce<Record<string, number>>((acc, t) => {
    acc[t.schemaKind] = (acc[t.schemaKind] ?? 0) + 1;
    return acc;
  }, {});

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = join(here, '..', 'src');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'tools.generated.ts');
  const banner = `/* AUTO-GENERATED — do not edit. Regenerate via 'npm run build' (runs scripts/generate-tools.ts). */`;
  const fileBody = `${banner}

export type SchemaKind =
  | 'chart'
  | 'twoChart'
  | 'chartTarget'
  | 'horoscopeSign'
  | 'horoscopeCompat'
  | 'year'
  | 'date'
  | 'generic';

export interface GeneratedTool {
  name: string;
  description: string;
  endpoint: string;
  schemaKind: SchemaKind;
  group: string;
}

export const GENERATED_TOOLS: readonly GeneratedTool[] = ${JSON.stringify(unique, null, 2)} as const;
`;

  writeFileSync(outPath, fileBody, 'utf8');

  console.log(`[generate-tools] wrote ${unique.length} tools → src/tools.generated.ts`);
  console.log(`[generate-tools] schema kinds: ${JSON.stringify(kindCounts)}`);
  console.log(`[generate-tools] skipped: ${JSON.stringify(skippedReason)}`);
}

main().catch((err) => {
  console.error('[generate-tools] FAILED:', err);
  process.exit(1);
});
