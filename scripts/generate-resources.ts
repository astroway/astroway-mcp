/**
 * Build-time generator: fetch the 14 public `/v1/reference/*` lookup endpoints
 * and embed their JSON in `src/resources.generated.ts` so the MCP server can
 * register them as Resources with no runtime API calls and no auth.
 *
 * Pairs with api-calc 2.17+ where /reference/* is unauthenticated and free.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.ASTROWAY_BASE_URL ?? 'https://api.astroway.info/v1';

interface ReferenceSpec {
  /** Slug used in URI: `astroway://reference/<slug>`. */
  slug: string;
  /** Path component on the API: `/v1/reference/<path>`. */
  path: string;
  /** Display title shown in MCP clients. */
  title: string;
  /** Short integrator-facing description. */
  description: string;
}

const REFERENCES: ReferenceSpec[] = [
  { slug: 'zodiac-signs',    path: 'signs',          title: 'Zodiac Signs',         description: '12 zodiac signs with element, modality, polarity, classical and modern rulers, exaltation, fall, detriment, and body parts.' },
  { slug: 'planets',         path: 'planets',        title: 'Planets',              description: 'Planetary bodies (Sun..Pluto + nodes + Chiron + Lilith) with archetype, rulerships, exaltation/fall/detriment, orbit period, and category.' },
  { slug: 'houses',          path: 'houses',         title: 'Houses',               description: '12 houses with natural sign, natural ruler, life area, classical and modern significations, axis pairing, and angularity.' },
  { slug: 'aspects',         path: 'aspects',        title: 'Aspects',              description: 'Major / minor / harmonic aspects with default orbs per orb school (Lilly, Ptolemy, modern), nature, and harmonic family.' },
  { slug: 'elements',        path: 'elements',       title: 'Elements',             description: 'Fire / earth / air / water with their qualities, signs, planetary affinity, season, body humour, and Jungian function.' },
  { slug: 'modalities',      path: 'modalities',     title: 'Modalities',           description: 'Cardinal / fixed / mutable modalities with associated signs, behavioural keyword, best uses, and shadow side.' },
  { slug: 'polarities',      path: 'polarities',     title: 'Polarities',           description: 'Masculine / feminine (yang / yin) polarities with associated signs and energetic descriptions.' },
  { slug: 'dignities',       path: 'dignities',      title: 'Essential Dignities',  description: 'Classical (Ptolemy / Lilly) essential dignities — domicile, exaltation, triplicity rulers, detriment, fall — with Lilly\'s scoring weights.' },
  { slug: 'decans',          path: 'decans',         title: 'Decans',               description: '36 decans (10° divisions) with Egyptian Chaldean ruler, modern triplicity ruler, classical face ruler.' },
  { slug: 'nakshatras',      path: 'nakshatras',     title: 'Nakshatras',           description: '27 Vedic nakshatras with Lahiri sidereal degree range, deity, Vimshottari ruler, gana, yoni, varna, guna, pada starting sign.' },
  { slug: 'hellenistic-lots', path: 'lots',           title: 'Hellenistic Lots',     description: 'Hellenistic Lots / Arabic Parts (Fortune, Spirit, Eros, ...) with day/night formulas, sect-sensitivity, and signification.' },
  { slug: 'asteroids',       path: 'asteroids',      title: 'Asteroids & Centaurs', description: 'Major asteroids and centaurs (Ceres, Pallas, Juno, Vesta, Chiron, Lilith, Eris, Sedna, Pholus) with Swiss Ephemeris ID, archetype, mythology, orbit period.' },
  { slug: 'zodiac-systems',  path: 'zodiac-systems', title: 'Zodiac Systems',       description: 'Zodiac systems supported (Tropical, Sidereal Lahiri/Fagan-Bradley/Krishnamurti/Raman, Draconic, Heliocentric) with current ayanamsha offset and primary use cases.' },
  { slug: 'glyphs',          path: 'glyphs',         title: 'Glyphs',               description: 'Unicode glyphs and fallback text for all astrological symbols (signs, planets, aspects, points, asteroids).' },
];

interface ApiEnvelope { ok: boolean; data?: unknown; error?: { code?: string; message?: string } }

async function fetchOne(spec: ReferenceSpec): Promise<unknown> {
  const url = `${BASE}/reference/${spec.path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${res.statusText}`);
  }
  const env = (await res.json()) as ApiEnvelope;
  if (!env.ok || env.data === undefined) {
    const msg = env.error?.message ?? 'unknown';
    throw new Error(`${url} → envelope.ok=false: ${msg}`);
  }
  return env.data;
}

async function main(): Promise<void> {
  console.log(`[generate-resources] fetching ${REFERENCES.length} reference resources from ${BASE}`);

  const fetched: { spec: ReferenceSpec; data: unknown; bytes: number }[] = [];
  for (const spec of REFERENCES) {
    const data = await fetchOne(spec);
    const bytes = JSON.stringify(data).length;
    fetched.push({ spec, data, bytes });
    console.log(`  ✓ ${spec.slug} — ${bytes.toLocaleString('en-US')} bytes`);
  }

  const totalBytes = fetched.reduce((acc, f) => acc + f.bytes, 0);
  console.log(`[generate-resources] total embedded JSON: ${totalBytes.toLocaleString('en-US')} bytes`);

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = join(here, '..', 'src');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'resources.generated.ts');

  const banner = `/* AUTO-GENERATED — do not edit. Regenerate via 'npm run build' (runs scripts/generate-resources.ts). */`;

  const entries = fetched.map(({ spec, data }) => {
    return `  ${JSON.stringify(spec.slug)}: {
    title: ${JSON.stringify(spec.title)},
    description: ${JSON.stringify(spec.description)},
    apiPath: ${JSON.stringify(`/reference/${spec.path}`)},
    data: ${JSON.stringify(data)},
  },`;
  });

  const fileBody = `${banner}

export interface ReferenceResource {
  /** Display title shown in MCP clients. */
  title: string;
  /** Integrator-facing description. */
  description: string;
  /** Source path on api.astroway.info (informational). */
  apiPath: string;
  /** Embedded canonical JSON payload. */
  data: unknown;
}

/**
 * Reference lookup data fetched from /v1/reference/* at build time.
 * Served by the MCP server as Resources at \`astroway://reference/<slug>\`.
 * No runtime API calls, no auth, no credit spend.
 */
export const REFERENCE_RESOURCES: Record<string, ReferenceResource> = {
${entries.join('\n')}
};
`;

  writeFileSync(outPath, fileBody, 'utf8');
  console.log(`[generate-resources] wrote ${fetched.length} resources → src/resources.generated.ts`);
}

main().catch((err) => {
  console.error('[generate-resources] FAILED:', err);
  process.exit(1);
});
