#!/usr/bin/env node
/**
 * @astroway/mcp — MCP server exposing the AstroWay API as tools for LLM agents.
 *
 * Generated tools come from build-time fetch of /v1/openapi.json
 * (see scripts/generate-tools.ts). Built-in tools (account_status, cost_estimate)
 * are hand-coded and registered alongside the generated ones.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { GENERATED_TOOLS, TYPED_SCHEMAS, OUTPUT_SCHEMAS, type SchemaKind } from './tools.generated.js';
import { REFERENCE_RESOURCES } from './resources.generated.js';
import { fetchAccountStatus } from './tools/account-status.js';
import { loadCostManifest, estimateOne, formatEstimate } from './tools/cost-estimate.js';
import { fetchWithRetry } from './retry.js';
import { registerAllPrompts } from './prompts.js';
import { registerAllResources } from './resources.js';
import { MCP_VERSION } from './version.js';
import { Logger, levelFromEnv } from './logger.js';
import { parseArgs, printVersion, printHelp, listTools, findToolEndpoint } from './cli.js';
import { installKeepAliveAgent } from './http-agent.js';

// Reuse TCP/TLS sockets across consecutive API calls (saves 30-50 ms per call).
installKeepAliveAgent();

// ─── CLI dispatch (runs before any MCP setup) ────────────────

const cli = parseArgs(process.argv);

if (cli.mode === 'version') {
  printVersion();
  process.exit(0);
}
if (cli.mode === 'help') {
  printHelp(cli.unknown);
  process.exit(cli.unknown ? 1 : 0);
}
if (cli.mode === 'list-tools') {
  listTools(cli.filter);
  process.exit(0);
}
if (cli.mode === 'list-resources') {
  process.stdout.write(`MCP Resources: ${Object.keys(REFERENCE_RESOURCES).length}\n\n`);
  for (const [slug, info] of Object.entries(REFERENCE_RESOURCES)) {
    process.stdout.write(`astroway://reference/${slug} — ${info.title} (source: ${info.apiPath})\n`);
  }
  process.exit(0);
}
if (cli.mode === 'list-prompts') {
  // Lazy-load prompts module to print the catalogue without booting the server.
  const { LIST_PROMPT_NAMES } = await import('./prompts.js');
  const names = LIST_PROMPT_NAMES();
  process.stdout.write(`MCP Prompts: ${names.length}\n\n`);
  for (const n of names) process.stdout.write(`${n}\n`);
  process.exit(0);
}

// ─── Env config ──────────────────────────────────────────────

const API_KEY = process.env.ASTROWAY_API_KEY ?? '';
const BASE_URL = process.env.ASTROWAY_BASE_URL ?? 'https://api.astroway.info/v1';
// LOG_LEVEL takes precedence; ASTROWAY_VERBOSE=1 maps to debug for back-compat.
const VERBOSE_LEGACY = process.env.ASTROWAY_VERBOSE === '1' || process.env.ASTROWAY_VERBOSE === 'true';
const LOG_LEVEL_INITIAL = process.env.LOG_LEVEL
  ? levelFromEnv(process.env.LOG_LEVEL)
  : (VERBOSE_LEGACY ? 'debug' : 'error');
// v0.9+ — register tools under `astroway_<group>_<name>` by default.
// MCP_FLAT_TOOLS=1 keeps the pre-v0.9 flat names for users who haven't migrated yet.
const FLAT_TOOLS = process.env.MCP_FLAT_TOOLS === '1' || process.env.MCP_FLAT_TOOLS === 'true';

// v1.0+ — subset registration. ASTROWAY_TOOL_GROUPS=western,vedic limits the
// catalogue to tools whose prefix matches one of the listed groups. Unset =
// register all 624. Lowercase, comma-separated, matches `astroway_<prefix>_*`.
const TOOL_GROUPS_RAW = (process.env.ASTROWAY_TOOL_GROUPS ?? '').trim();
const TOOL_GROUPS: ReadonlySet<string> | null = TOOL_GROUPS_RAW
  ? new Set(TOOL_GROUPS_RAW.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
  : null;

// v1.0+ — skip groups that consume LLM credits (AI interpretations, AI reports,
// daily/weekly horoscope text). Deterministic calculation tools stay enabled.
const READONLY = process.env.ASTROWAY_READONLY === '1' || process.env.ASTROWAY_READONLY === 'true';
const LLM_GROUPS: ReadonlySet<string> = new Set(['ai', 'horoscope', 'reports']);

const log = new Logger(LOG_LEVEL_INITIAL, process.env.LOG_FILE);

if (!API_KEY) {
  log.error('ASTROWAY_API_KEY environment variable is required.');
  log.error('Get a key at https://api.astroway.info/dashboard/sign-up — 10,000 credits/month free.');
  log.error('Then set: export ASTROWAY_API_KEY="aw_live_..." (or aw_test_... for sandbox).');
  process.exit(1);
}

// v0.10+ — F20: warn loudly when the user pointed at a non-default API host.
// Mistyped BASE_URL or stale staging URL is a classic source of "everything
// silently broken" bugs that surfaces only in production results.
const KNOWN_BASE_URLS: ReadonlySet<string> = new Set([
  'https://api.astroway.info/v1',
  'https://staging-api.astroway.info/v1',
]);
if (!KNOWN_BASE_URLS.has(BASE_URL)) {
  log.warn(
    `ASTROWAY_BASE_URL points to a non-default host: ${BASE_URL}. ` +
    `Make sure this is intentional — chart calculations and AI interpretations ` +
    `may differ from production. Canonical host is https://api.astroway.info/v1.`,
  );
}

// ─── HTTP caller ─────────────────────────────────────────────

interface CallResult {
  /** Pretty-printed text representation for the LLM's content channel. */
  text: string;
  /** Parsed `data` payload, or undefined on error/network failure. */
  structured?: unknown;
}

async function callApi(endpoint: string, body: Record<string, unknown>): Promise<CallResult> {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  log.debug(`POST ${url}`, { body: JSON.stringify(body).slice(0, 500) });
  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
        'User-Agent': `astroway-mcp/${MCP_VERSION} (Node/${process.versions.node})`,
        'X-Astroway-Channel': 'mcp',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } };
    log.debug(`← ${res.status} ${res.statusText}`);
    if (!res.ok || !json.ok) {
      const err = json.error ?? {};
      const code = err.code ?? 'UNKNOWN';
      const message = err.message ?? 'Unknown error';
      let hint = '';
      if (code === 'RATE_LIMITED' || res.status === 429) {
        hint = '\n\nHint: rate limit exceeded. Wait 60s or upgrade tier (call `astroway_account_status` to see current limit).';
      } else if (code === 'OUT_OF_CREDITS' || code === 'PLAN_UPGRADE_REQUIRED' || res.status === 402) {
        hint = '\n\nHint: budget exceeded or endpoint requires a higher tier. Call `astroway_account_status` to check.';
      } else if (code === 'INVALID_KEY' || res.status === 401) {
        hint = '\n\nHint: API key invalid or revoked. Generate a new one at https://api.astroway.info/dashboard/keys.';
      }
      return { text: `Error ${res.status} (${code}): ${message}${hint}` };
    }
    return { text: JSON.stringify(json.data, null, 2), structured: json.data };
  } catch (e: any) {
    return { text: `Network error calling ${endpoint}: ${e?.message ?? 'unknown'}. Check your connection or ASTROWAY_BASE_URL.` };
  }
}

// ─── --call CLI dispatch (after callApi is defined) ──────────

if (cli.mode === 'call') {
  const endpoint = findToolEndpoint(cli.toolName ?? '');
  if (!endpoint) {
    process.stderr.write(`Tool not found: ${cli.toolName}. Run --list-tools to see all names.\n`);
    process.exit(1);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(cli.json ?? '{}') as Record<string, unknown>;
  } catch (e) {
    process.stderr.write(`Invalid --json: ${(e as Error).message}\n`);
    process.exit(1);
  }
  const result = await callApi(endpoint, body);
  process.stdout.write(result.text + '\n');
  process.exit(0);
}

// ─── Schema shapes (one per SchemaKind) ──────────────────────
//
// v0.9.1+ — tight bounds on all numeric/string fields so MCP clients catch
// invalid input at validation time instead of silently computing for "the
// equator off Ghana at UTC". No more `.default(0)` on lat/lon/tzOffset —
// users must provide real birth coordinates.

const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE  = /^\d{2}:\d{2}(:\d{2})?$/;

/** Swiss Ephemeris house system letter codes — superset of what api-calc accepts. */
const HOUSE_SYSTEM_CODES = ['P', 'K', 'O', 'W', 'E', 'R', 'C', 'T', 'M', 'B', 'H', 'U', 'V', 'X', 'Y', 'Z', 'L', 'S'] as const;

/** 21-code superset honored by /horoscope/* + /reports/ai/* + /interpret/* localization. */
const LANGUAGE_CODES = ['uk', 'en', 'de', 'ru', 'pl', 'es', 'pt', 'hi', 'fr', 'ko', 'it', 'ja', 'id', 'tr', 'nl', 'ro', 'cs', 'vi', 'ar', 'el', 'hu'] as const;

const SIGN_ENUM = z.enum([
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
]);

const dateField    = () => z.string().regex(DATE_RE, 'Use YYYY-MM-DD').describe('Date YYYY-MM-DD (e.g. 1990-05-15)');
const timeField    = () => z.string().regex(TIME_RE, 'Use HH:mm or HH:mm:ss').describe('Time HH:mm:ss in local civil time at birth place');
const latField     = () => z.number().min(-90).max(90).describe('Latitude in decimal degrees, range -90..+90 (e.g. 50.45)');
const lonField     = () => z.number().min(-180).max(180).describe('Longitude in decimal degrees, range -180..+180 (positive=east, e.g. 30.52)');
const tzField      = () => z.number().min(-12).max(14).describe('UTC offset in hours at the moment, range -12..+14 (use 0 for UTC, 3 for EEST, -5 for EST)');

const chartShape = {
  date: dateField().describe('Birth date YYYY-MM-DD'),
  time: timeField().describe('Birth time HH:mm:ss (local civil time at the place of birth)'),
  timezoneOffset: tzField().describe('UTC offset in hours at birth (e.g. 3 for EEST, -5 for EST, 0 for UTC)'),
  latitude: latField().describe('Birth latitude in decimal degrees, range -90..+90'),
  longitude: lonField().describe('Birth longitude in decimal degrees, range -180..+180 (positive=east)'),
  houseSystem: z.enum(HOUSE_SYSTEM_CODES).optional().describe('House system letter: P=Placidus (default), K=Koch, O=Porphyry, W=Whole Sign, E=Equal (Asc), R=Regiomontanus, C=Campanus, T=Topocentric, M=Morinus, B=Alcabitius'),
  city: z.string().optional().describe('City name (display only — server does not geocode)'),
} as const;

const twoChartShape = {
  chart1_date: dateField().describe('Person 1 birth date YYYY-MM-DD'),
  chart1_time: timeField().describe('Person 1 birth time HH:mm:ss (local)'),
  chart1_tz:   tzField().describe('Person 1 UTC offset in hours at birth'),
  chart1_lat:  latField().describe('Person 1 birth latitude in decimal degrees'),
  chart1_lon:  lonField().describe('Person 1 birth longitude in decimal degrees'),
  chart2_date: dateField().describe('Person 2 birth date YYYY-MM-DD'),
  chart2_time: timeField().describe('Person 2 birth time HH:mm:ss (local)'),
  chart2_tz:   tzField().describe('Person 2 UTC offset in hours at birth'),
  chart2_lat:  latField().describe('Person 2 birth latitude in decimal degrees'),
  chart2_lon:  lonField().describe('Person 2 birth longitude in decimal degrees'),
  language:    z.enum(LANGUAGE_CODES).optional().describe('Output language for AI interpretations (default en)'),
} as const;

const chartTargetShape = {
  ...chartShape,
  targetDate:     dateField().optional().describe('Target date YYYY-MM-DD for transit/progression/return/dasha lookup (default: today)'),
  targetTime:     timeField().optional().describe('Target time HH:mm:ss (default 12:00:00 UTC)'),
  targetTzOffset: tzField().optional().describe('Target UTC offset in hours (default 0 — UTC)'),
} as const;

const horoscopeSignShape = {
  sign:     SIGN_ENUM.describe('Zodiac sign (lowercase): aries, taurus, …'),
  date:     dateField().optional().describe('Date YYYY-MM-DD (default: today)'),
  language: z.enum(LANGUAGE_CODES).optional().describe('Output language (default en)'),
} as const;

const horoscopeCompatShape = {
  sign1:    SIGN_ENUM.describe('First zodiac sign (lowercase)'),
  sign2:    SIGN_ENUM.describe('Second zodiac sign (lowercase)'),
  language: z.enum(LANGUAGE_CODES).optional().describe('Output language (default en)'),
} as const;

const yearShape = {
  year: z.number().int().min(1900).max(2100).describe('Year, range 1900..2100 (Swiss Ephemeris precision window)'),
} as const;

const dateShape = {
  date:           dateField().describe('Date YYYY-MM-DD'),
  latitude:       latField().optional().describe('Latitude (some date-only endpoints accept location for sunrise/sunset/panchang etc.)'),
  longitude:      lonField().optional().describe('Longitude (paired with latitude)'),
  timezoneOffset: tzField().optional().describe('UTC offset in hours (default 0 — UTC)'),
} as const;

const genericShape = {
  body: z.record(z.string(), z.unknown()).describe('Raw JSON body — see the example in the tool description for required fields'),
} as const;

const SCHEMAS: Record<SchemaKind, Record<string, z.ZodTypeAny>> = {
  chart: chartShape,
  twoChart: twoChartShape,
  chartTarget: chartTargetShape,
  horoscopeSign: horoscopeSignShape,
  horoscopeCompat: horoscopeCompatShape,
  year: yearShape,
  date: dateShape,
  generic: genericShape,
  typed: genericShape, // sentinel — actual shape resolved per tool from TYPED_SCHEMAS
};

/**
 * For 'typed' tools, resolve the inputSchema from TYPED_SCHEMAS[componentName].
 * Returns a ZodRawShape. Falls back to genericShape if the component isn't a ZodObject.
 */
function resolveTypedShape(componentName: string): Record<string, z.ZodTypeAny> {
  const schema = TYPED_SCHEMAS[componentName];
  if (!schema) return genericShape;
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodTypeAny>;
  }
  // Non-object root (e.g. an array) — wrap so MCP gets a single 'body' field.
  return { body: schema };
}

// ─── Body transformers ───────────────────────────────────────

function chartBody(p: Record<string, unknown>): Record<string, unknown> {
  const { houseSystem, city, ...rest } = p;
  const out: Record<string, unknown> = { ...rest };
  if (houseSystem !== undefined) out.houseSystem = houseSystem;
  if (city !== undefined) out.city = city;
  return out;
}

function twoChartBody(p: Record<string, any>): Record<string, unknown> {
  return {
    chart1: {
      date: p.chart1_date, time: p.chart1_time,
      timezoneOffset: p.chart1_tz, latitude: p.chart1_lat, longitude: p.chart1_lon,
    },
    chart2: {
      date: p.chart2_date, time: p.chart2_time,
      timezoneOffset: p.chart2_tz, latitude: p.chart2_lat, longitude: p.chart2_lon,
    },
    ...(p.language ? { language: p.language } : {}),
  };
}

const BODY_TRANSFORMERS: Record<SchemaKind, (p: Record<string, any>) => Record<string, unknown>> = {
  chart: chartBody,
  chartTarget: chartBody,
  twoChart: twoChartBody,
  horoscopeSign: (p) => p,
  horoscopeCompat: (p) => p,
  year: (p) => p,
  date: (p) => p,
  generic: (p) => (typeof p.body === 'object' && p.body !== null ? (p.body as Record<string, unknown>) : p),
  typed: (p) => p, // typed schemas pass through — fields match server expectation directly
};

// ─── MCP Server ──────────────────────────────────────────────

const server = new McpServer(
  {
    name: 'astroway',
    version: MCP_VERSION,
  },
  {
    // Declare logging capability so MCP clients (Claude Desktop debug panel,
    // Inspector, etc.) can subscribe to logging notifications and call
    // logging/setLevel to dynamically change verbosity at runtime.
    capabilities: { logging: {} },
  },
);
log.attachMcp({ sendLoggingMessage: server.server.sendLoggingMessage.bind(server.server) });

// ─── Built-in tools (handle-coded) ───────────────────────────

server.registerTool(
  'astroway_account_status',
  {
    title: 'Account Status',
    description: 'Check current API key status: tier, credit balance, rate limits, monthly cycle reset. Run this BEFORE invoking expensive endpoints (Tier 4+ at 100+ credits, Tier 6/7 at 500-5000 credits) to confirm the user has budget. Returns plain-text human-readable summary.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const text = await fetchAccountStatus(BASE_URL, API_KEY);
    return { content: [{ type: 'text' as const, text }] };
  },
);

server.registerTool(
  'astroway_cost_estimate',
  {
    title: 'Cost Estimate',
    description: 'Estimate the credit cost of one or more endpoints WITHOUT invoking them. Returns total + per-endpoint breakdown with tier annotations. Useful when planning multi-step workflows: estimate first, ask user confirmation, then invoke. Cache TTL 5 min.',
    inputSchema: {
      // v0.10+ — F23: example arrays surfaced to MCP clients via Zod meta.
      // Compatible MCP clients render these as input suggestions / autocomplete.
      endpoints: z.array(z.string()).min(1)
        .describe('Endpoint paths to estimate, e.g. ["/chart", "/synastry", "/reports/natal"]. Leading slash optional.')
        .meta({
          examples: [
            ['/chart'],
            ['/chart', '/synastry'],
            ['/chart', '/transits', '/reports/natal'],
          ],
        }),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ endpoints }) => {
    const manifest = await loadCostManifest(BASE_URL);
    const results = endpoints.map((e: string) => estimateOne(manifest, e));
    return { content: [{ type: 'text' as const, text: formatEstimate(results) }] };
  },
);

// ─── Generated tools ─────────────────────────────────────────

/**
 * For tools with hasOutput, return the OUTPUT_SCHEMAS entry as a ZodRawShape
 * (i.e. the .shape of a ZodObject). Returns undefined when the schema isn't
 * an object (rare — generator filters non-object data shapes earlier).
 */
function resolveOutputShape(toolName: string): Record<string, z.ZodTypeAny> | undefined {
  const schema = OUTPUT_SCHEMAS[toolName];
  if (!schema) return undefined;
  if (schema instanceof z.ZodObject) return schema.shape as Record<string, z.ZodTypeAny>;
  return undefined;
}

/**
 * Extracts the namespace prefix from `astroway_<prefix>_<rest>`.
 * Falls back to the full name when the tool wasn't generated with a prefix.
 */
function toolPrefix(prefixedName: string): string {
  const parts = prefixedName.split('_');
  return parts.length >= 2 ? parts[1].toLowerCase() : prefixedName.toLowerCase();
}

// v1.0+ — collect prefixes that exist in the catalogue so we can warn about
// typos before silently registering 0 tools.
const ALL_PREFIXES = new Set(GENERATED_TOOLS.map((t) => toolPrefix(t.prefixedName)));
if (TOOL_GROUPS) {
  const unknown = [...TOOL_GROUPS].filter((g) => !ALL_PREFIXES.has(g));
  if (unknown.length > 0) {
    log.warn(
      `ASTROWAY_TOOL_GROUPS contains unknown prefix(es): ${unknown.join(', ')}. ` +
      `Valid prefixes: ${[...ALL_PREFIXES].sort().join(', ')}.`,
    );
  }
}

let registered = 2; // built-in count
let outputRegistered = 0;
let skippedByGroup = 0;
let skippedByReadonly = 0;
for (const tool of GENERATED_TOOLS) {
  const prefix = toolPrefix(tool.prefixedName);
  if (TOOL_GROUPS && !TOOL_GROUPS.has(prefix)) {
    skippedByGroup++;
    continue;
  }
  if (READONLY && LLM_GROUPS.has(prefix)) {
    skippedByReadonly++;
    continue;
  }
  const schema = tool.schemaKind === 'typed' && tool.typedRef
    ? resolveTypedShape(tool.typedRef)
    : SCHEMAS[tool.schemaKind];
  const transform = BODY_TRANSFORMERS[tool.schemaKind];
  const outputShape = tool.hasOutput ? resolveOutputShape(tool.name) : undefined;
  if (outputShape) outputRegistered++;
  const registeredName = FLAT_TOOLS ? tool.name : tool.prefixedName;
  server.registerTool(
    registeredName,
    {
      title: tool.title ?? tool.name,
      description: tool.description,
      inputSchema: schema,
      ...(outputShape ? { outputSchema: outputShape } : {}),
      annotations: tool.annotations,
    },
    async (params) => {
      const body = transform(params as Record<string, any>);
      const result = await callApi(tool.endpoint, body);
      const response: {
        content: { type: 'text'; text: string }[];
        structuredContent?: { [x: string]: unknown };
      } = {
        content: [{ type: 'text' as const, text: result.text }],
      };
      // Only attach structuredContent when the tool advertises an outputSchema —
      // MCP clients validate structuredContent against outputSchema, so omitting
      // both keeps error responses (text-only) from failing validation.
      if (outputShape && result.structured && typeof result.structured === 'object' && !Array.isArray(result.structured)) {
        response.structuredContent = result.structured as { [x: string]: unknown };
      }
      return response;
    },
  );
  registered++;
}

// ─── Prompts + Resources ─────────────────────────────────────

const promptCount = registerAllPrompts(server);
const resourceCount = registerAllResources(server);

/**
 * v0.11+ — F19: tools/prompts/resources lists are baked at npm-install time
 * and never mutate during a session. The MCP SDK still advertises
 * `listChanged: true` for all three (it can't tell a static catalogue apart
 * from a dynamic one), but in practice we never emit a list_changed
 * notification.
 *
 * This helper exists for future-you: if a release ever ships hot-reload of
 * tools.generated.ts (e.g. on SIGHUP refetch openapi.json + re-register),
 * call this to notify subscribed clients that their cached catalogue is stale.
 */
export function notifyCatalogueChange(reason: string): void {
  log.info(`tool/prompt/resource catalogue changed: ${reason}`);
  // SDK methods are sync (return void) despite the d.ts shape; no need to await.
  server.sendToolListChanged();
  server.sendPromptListChanged();
  server.sendResourceListChanged();
}

const filtersDesc: string[] = [];
if (TOOL_GROUPS) filtersDesc.push(`groups=[${[...TOOL_GROUPS].sort().join(',')}]`);
if (READONLY) filtersDesc.push('readonly=true');
const skippedTotal = skippedByGroup + skippedByReadonly;
const filtersSummary = filtersDesc.length > 0
  ? `${filtersDesc.join(', ')} → ${skippedTotal} of ${GENERATED_TOOLS.length} tools skipped`
  : 'none (all groups registered)';

log.info(`registered ${registered} tools (${outputRegistered} with outputSchema) + ${promptCount} prompts + ${resourceCount} resources`, {
  base: BASE_URL,
  level: log.getLevel(),
  naming: FLAT_TOOLS ? 'flat (legacy MCP_FLAT_TOOLS=1)' : 'astroway_<group>_<tool>',
  catalogue: 'frozen-at-boot (listChanged advertised but not emitted in this build)',
  filters: filtersSummary,
  telemetry: 'disabled (this MCP server does not phone home — User-Agent + X-Astroway-Channel only)',
});

// Graceful shutdown: close transport cleanly so MCP clients don't see a torn pipe.
function shutdown(reason: string): void {
  log.info(`shutting down: ${reason}`);
  transport.close().catch(() => { /* drop */ });
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
  log.error('failed to start', { error: (err as Error)?.message ?? String(err) });
  process.exit(1);
});
