/**
 * MCP Prompts — canonical workflow templates for the AstroWay API.
 *
 * Prompts are slash-command-style entry points the user invokes explicitly
 * (e.g., "/astroway natal-chart-summary"). Each prompt assembles a structured
 * instruction that tells the LLM which steps to take using the registered
 * tools, then synthesize the result.
 *
 * Prompts deliberately do NOT hardcode specific tool names — the LLM picks
 * matching tools from the 600+ catalog based on the workflow description.
 * If the API renames a tool, prompts keep working.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import { z } from 'zod';

const SIGN_VALUES = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;

const LANG_VALUES = ['uk', 'en'] as const;

// MCP SDK's completable() expects callbacks taking `string` (not `string | undefined`),
// so completable args use `.default(...)` instead of `.optional()`. The handler always
// receives a real string (the default if user omitted).

function langCompletable() {
  return completable(
    z.string().default('en').describe('Output language: uk or en'),
    (value: string | undefined) => LANG_VALUES.filter((l) => l.startsWith((value ?? '').toLowerCase())),
  );
}

function signCompletable() {
  return completable(
    z.string().describe('Zodiac sign (lowercase): aries, taurus, gemini, …'),
    (value: string) => SIGN_VALUES.filter((s) => s.startsWith(value.toLowerCase())),
  );
}

const birthDataArgs = {
  birthDate: z.string().describe('Birth date YYYY-MM-DD'),
  birthTime: z.string().describe('Birth time HH:mm:ss in local civil time'),
  latitude: z.string().describe('Birth place latitude in decimal degrees, e.g. 50.45'),
  longitude: z.string().describe('Birth place longitude in decimal degrees, e.g. 30.52'),
  timezoneOffset: z.string().describe('UTC offset in hours at birth, e.g. 3 for EEST or -5 for EST'),
};

// ─── Prompt definitions ──────────────────────────────────────────────────

/** Static catalogue used by `astroway-mcp --list-prompts`. Keep in sync with registerAllPrompts(). */
export function LIST_PROMPT_NAMES(): readonly string[] {
  return [
    'natal-chart-summary',
    'synastry-analysis',
    'transit-coach',
    'daily-horoscope',
    'vedic-kundli-summary',
    'tarot-three-card',
    'human-design-bodygraph',
    'bazi-four-pillars',
    'numerology-life-path',
    'lunar-phase-day',
    'retrograde-warning',
    'cost-aware-multistep-planner',
  ];
}

export function registerAllPrompts(server: McpServer): number {
  let count = 0;

  // 1. natal-chart-summary
  server.registerPrompt(
    'natal-chart-summary',
    {
      title: 'Natal Chart Summary',
      description: 'Compute a natal chart and synthesize a structured interpretation: Big Three, dominant element/modality, key aspects, and life themes.',
      argsSchema: {
        ...birthDataArgs,
        language: langCompletable(),
      },
    },
    ({ birthDate, birthTime, latitude, longitude, timezoneOffset, language }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a natal chart interpretation using the AstroWay API.

Birth data:
- date=${birthDate}, time=${birthTime}
- latitude=${latitude}, longitude=${longitude}, timezoneOffset=${timezoneOffset}
- houseSystem=P (Placidus)

Workflow:
1. Compute the natal chart (planets, houses, ascendant, MC).
2. Fetch the aspect table — focus on aspects with orb ≤ 8°.
3. Fetch element + modality dominants.

Synthesis:
- **Big Three**: Sun, Moon, Ascendant — each with sign + house + 1-line interpretation tied to this specific chart.
- **Dominant pattern**: which element + modality lead and what that means for this person.
- **3-5 defining aspects**: choose tightest orbs (preferably under 3°) — explain function, not textbook description.
- **Life themes**: 2-3 emergent themes from the configuration (not a generic "you are sensitive" list).

Output language: ${language ?? 'en'}. Be specific to this chart, avoid astrology platitudes.`,
          },
        },
      ],
    }),
  );
  count++;

  // 2. synastry-analysis
  server.registerPrompt(
    'synastry-analysis',
    {
      title: 'Synastry Analysis',
      description: 'Compatibility analysis between two natal charts: cross-aspects, composite midpoints, key dynamics.',
      argsSchema: {
        person1Date: z.string().describe('Person 1 birth date YYYY-MM-DD'),
        person1Time: z.string().describe('Person 1 birth time HH:mm:ss'),
        person1Lat: z.string().describe('Person 1 birth latitude'),
        person1Lon: z.string().describe('Person 1 birth longitude'),
        person1Tz: z.string().describe('Person 1 UTC offset in hours'),
        person2Date: z.string().describe('Person 2 birth date YYYY-MM-DD'),
        person2Time: z.string().describe('Person 2 birth time HH:mm:ss'),
        person2Lat: z.string().describe('Person 2 birth latitude'),
        person2Lon: z.string().describe('Person 2 birth longitude'),
        person2Tz: z.string().describe('Person 2 UTC offset in hours'),
        language: langCompletable(),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Run a synastry compatibility analysis using the AstroWay API.

Chart 1: ${args.person1Date} ${args.person1Time} at ${args.person1Lat}, ${args.person1Lon} (UTC${args.person1Tz})
Chart 2: ${args.person2Date} ${args.person2Time} at ${args.person2Lat}, ${args.person2Lon} (UTC${args.person2Tz})

Workflow:
1. Compute the synastry chart (cross-aspects between the two charts).
2. Compute the composite midpoint chart.
3. Optionally Davison relationship chart for time-marker insight.

Synthesis:
- **Top 5 cross-aspects** (tightest orbs, major bodies): function in the relationship, not textbook.
- **Element/modality dialogue**: do they complement or amplify? Concrete example.
- **Composite Sun + Moon + ASC**: the relationship's identity.
- **Areas of growth + friction**: 2-3 each, evidence-based.

Avoid 'soulmate' language. Output language: ${args.language ?? 'en'}.`,
          },
        },
      ],
    }),
  );
  count++;

  // 3. transit-coach
  server.registerPrompt(
    'transit-coach',
    {
      title: 'Transit Coach',
      description: 'Current transits affecting the natal chart, focused on the 3 most impactful for the target date.',
      argsSchema: {
        ...birthDataArgs,
        targetDate: z.string().optional().describe('Target date YYYY-MM-DD (default: today)'),
        language: langCompletable(),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Analyze current transits for the user's natal chart using the AstroWay API.

Natal: date=${args.birthDate} time=${args.birthTime} at ${args.latitude}, ${args.longitude} (UTC${args.timezoneOffset})
Target date: ${args.targetDate ?? 'today'}

Workflow:
1. Compute current transits affecting the natal chart on the target date.
2. Optionally pull the upcoming 30-day transit calendar to see what's about to peak.
3. Note the lunar phase + sign at the target.

Synthesis:
- **Top 3 transits** by significance (slow planets to angles/luminaries score highest):
  - Aspect, exact date(s), what's been triggered in the natal chart.
  - Practical implications for the next 1-4 weeks.
- **Lunar context**: phase + sign of moon at target — emotional weather.
- **Actionable**: 1-2 things to lean into, 1 thing to avoid.

Skip generic 'mercury retrograde' fearmongering — only flag if it actually aspects the chart. Output language: ${args.language ?? 'en'}.`,
          },
        },
      ],
    }),
  );
  count++;

  // 4. daily-horoscope
  server.registerPrompt(
    'daily-horoscope',
    {
      title: 'Daily Horoscope',
      description: 'Personalized daily horoscope for a given Sun sign.',
      argsSchema: {
        sign: signCompletable(),
        date: z.string().optional().describe('Date YYYY-MM-DD (default: today)'),
        language: langCompletable(),
      },
    },
    ({ sign, date, language }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a daily horoscope for ${sign} for ${date ?? 'today'} using the AstroWay API.

Workflow:
1. Fetch the daily horoscope for ${sign} on ${date ?? 'today'}.
2. Present in a clear, useful format — 3-4 sections: love/career/health/general.

Keep it grounded — concrete advice, not 'Saturn brings transformation'. Output language: ${language ?? 'en'}.`,
          },
        },
      ],
    }),
  );
  count++;

  // 5. vedic-kundli-summary
  server.registerPrompt(
    'vedic-kundli-summary',
    {
      title: 'Vedic Kundli Summary',
      description: 'Vedic (sidereal) chart summary: rashi/lagna/navamsha + active mahadasha + key yogas.',
      argsSchema: {
        ...birthDataArgs,
        ayanamsa: completable(
          z.string().default('lahiri').describe('Ayanamsa system: lahiri, raman, krishnamurti, fagan-bradley'),
          (value: string | undefined) => ['lahiri', 'raman', 'krishnamurti', 'fagan-bradley'].filter((a) => a.startsWith((value ?? '').toLowerCase())),
        ),
        language: langCompletable(),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a Vedic (sidereal) chart summary using the AstroWay API.

Birth: ${args.birthDate} ${args.birthTime} at ${args.latitude}, ${args.longitude} (UTC${args.timezoneOffset})
Ayanamsa: ${args.ayanamsa ?? 'lahiri'}

Workflow:
1. Compute the Vedic D1 (rashi) chart with the chosen ayanamsa.
2. Identify lagna (ascendant), moon nakshatra + pada, rashi disposition.
3. Pull the active Vimshottari mahadasha (and current antardasha if available).
4. Detect prominent yogas (Raja, Dhana, Pancha-Mahapurusha, doshas).

Synthesis:
- **Lagna + lord placement**: what the soul vehicle is built for.
- **Moon nakshatra**: emotional + karmic blueprint, 1 actionable insight.
- **Active dasha**: planet, period, themes likely active right now.
- **2-3 yogas of note**: explain how each affects life areas.
- **Any doshas** (Mangal, Kala Sarpa, Kemadruma): degree of activation, mitigations.

Output language: ${args.language ?? 'en'}. Avoid Sanskrit terms without translation.`,
          },
        },
      ],
    }),
  );
  count++;

  // 6. tarot-three-card
  server.registerPrompt(
    'tarot-three-card',
    {
      title: 'Tarot Three-Card Spread',
      description: 'Past–Present–Future tarot reading for a specific question.',
      argsSchema: {
        question: z.string().describe('The question to read for. Be specific — not "what about my life" but "should I take the offer at company X"'),
        deck: completable(
          z.string().default('rws').describe('Deck: rws (Rider-Waite-Smith), marseille, lenormand'),
          (value: string | undefined) => ['rws', 'marseille', 'lenormand'].filter((d) => d.startsWith((value ?? '').toLowerCase())),
        ),
        language: langCompletable(),
      },
    },
    ({ question, deck, language }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Run a Past–Present–Future tarot reading using the AstroWay API.

Question: "${question}"
Deck: ${deck ?? 'rws'}

Workflow:
1. Draw 3 cards (no replacement) for past, present, future positions.
2. For each card: name, position, upright/reversed.

Synthesis:
- **Past**: what energy preceded the situation.
- **Present**: where the querent is right now in this question.
- **Future**: trajectory if current course continues.
- **Synthesis**: what the spread is telling the querent — concrete, not "you might want to consider".

Output language: ${language ?? 'en'}. The reading should engage the SPECIFIC question, not be generic.`,
          },
        },
      ],
    }),
  );
  count++;

  // 7. human-design-bodygraph
  server.registerPrompt(
    'human-design-bodygraph',
    {
      title: 'Human Design Bodygraph',
      description: 'HD bodygraph summary: type, strategy, authority, profile, defined centers and channels.',
      argsSchema: {
        ...birthDataArgs,
        language: langCompletable(),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a Human Design bodygraph summary using the AstroWay API.

Birth: ${args.birthDate} ${args.birthTime} at ${args.latitude}, ${args.longitude} (UTC${args.timezoneOffset})

Workflow:
1. Compute the bodygraph (personality + design crystals at birth and 88° before).
2. Determine: type, strategy, authority, profile (line/line), inner authority.
3. Identify defined vs. open centers, key channels.

Synthesis:
- **Type + strategy**: what to do (Generator wait-respond, Manifestor inform, etc.) in 1-2 sentences.
- **Authority**: how to make decisions correctly for this design.
- **Profile**: life theme in 1 line.
- **Defined centers**: what's reliably available; **open centers**: where conditioning happens — biggest open center + practical "not-self" warning sign.
- **Top 1-2 channels**: signature gifts.

Output language: ${args.language ?? 'en'}. Avoid HD jargon without translation.`,
          },
        },
      ],
    }),
  );
  count++;

  // 8. cost-aware-multistep-planner
  server.registerPrompt(
    'cost-aware-multistep-planner',
    {
      title: 'Cost-Aware Multi-Step Planner',
      description: 'Plan a multi-step astrology workflow, estimate total credit cost, and run only after user confirms budget.',
      argsSchema: {
        workflowDescription: z.string().describe('Plain-English description of the astrology workflow the user wants. E.g., "compute natal + Vedic kundli + synastry with partner + a personalised PDF report".'),
      },
    },
    ({ workflowDescription }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Plan and price a multi-step astrology workflow using the AstroWay API.

User wants: "${workflowDescription}"

Workflow:
1. Call \`astroway_account_status\` first — confirm the user has budget headroom.
2. Decompose the request into a sequence of API endpoints (use the most specific tools available, prefer free/cheap reference data over billed compute where possible).
3. Call \`astroway_cost_estimate\` with the proposed endpoint list — get total + per-step credit cost.
4. Present the plan to the user as a TABLE (step #, endpoint, purpose, credit cost). Include the running total and what % of remaining budget that represents.
5. Ask the user to confirm before invoking. If any step is Tier 6/7 (≥250 credits), highlight it and explain alternatives if they exist.
6. Only after explicit confirmation, run the steps.

This prompt's goal is to PREVENT surprise costs. Premium endpoints (5,000-credit Tier 7 PDF reports, 500-credit rectifications) should never be invoked without an explicit "yes, charge me" from the user.`,
          },
        },
      ],
    }),
  );
  count++;

  // 9. bazi-four-pillars
  server.registerPrompt(
    'bazi-four-pillars',
    {
      title: 'BaZi Four Pillars',
      description: 'Chinese astrology Four Pillars analysis: day master, element balance, ten gods, luck pillars.',
      argsSchema: {
        ...birthDataArgs,
        gender: completable(
          z.string().describe('Gender: male or female (used for luck pillar direction)'),
          (value: string) => ['male', 'female'].filter((g) => g.startsWith(value.toLowerCase())),
        ),
        language: langCompletable(),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a BaZi (Four Pillars) analysis using the AstroWay API.

Birth: ${args.birthDate} ${args.birthTime} at ${args.latitude}, ${args.longitude} (UTC${args.timezoneOffset})
Gender: ${args.gender}

Workflow:
1. Compute the four pillars (year, month, day, hour) — heavenly stem + earthly branch each.
2. Identify the day master (day-stem) — element + polarity.
3. Build the ten gods (interactions of other stems with day master).
4. Compute the luck pillars (10-year periods) — current and next.
5. Assess element balance (weak vs strong day master, what's missing).

Synthesis:
- **Day master**: element + yin/yang, what it expresses.
- **Element balance**: dominant/missing — actionable lifestyle implications.
- **Useful god vs. unfavorable god**: what to seek out, what to balance against.
- **Current luck pillar**: theme of the active 10-year cycle.
- **Next pillar transition**: when + flavor change.

Output language: ${args.language ?? 'en'}. Translate Chinese terms in parentheses on first use.`,
          },
        },
      ],
    }),
  );
  count++;

  // 10. numerology-life-path
  server.registerPrompt(
    'numerology-life-path',
    {
      title: 'Numerology Life Path',
      description: 'Pythagorean or Chaldean numerology: life path, destiny, soul, personality numbers + current personal year.',
      argsSchema: {
        fullName: z.string().describe('Full birth name as it appears on the birth certificate'),
        birthDate: z.string().describe('Birth date YYYY-MM-DD'),
        system: completable(
          z.string().default('pythagorean').describe('System: pythagorean (Western) or chaldean (older, mystic)'),
          (value: string | undefined) => ['pythagorean', 'chaldean'].filter((s) => s.startsWith((value ?? '').toLowerCase())),
        ),
        language: langCompletable(),
      },
    },
    ({ fullName, birthDate, system, language }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a numerology profile using the AstroWay API.

Name: ${fullName}
Birth date: ${birthDate}
System: ${system ?? 'pythagorean'}

Workflow:
1. Compute Life Path number (from birth date).
2. Compute Destiny / Expression number (from full name).
3. Compute Soul Urge / Heart's Desire number (from vowels).
4. Compute Personality number (from consonants).
5. Compute the current Personal Year.

Synthesis:
- **Life Path**: core life lesson + 1 concrete behavior pattern.
- **Destiny**: what the person is here to express, vs. what they may default to.
- **Soul Urge**: motivations that may not be visible from outside.
- **Personality**: how others read them.
- **Personal Year**: theme of this year, what to lean into / avoid.
- Master numbers (11, 22, 33) noted explicitly.

Output language: ${language ?? 'en'}.`,
          },
        },
      ],
    }),
  );
  count++;

  // 11. lunar-phase-day
  server.registerPrompt(
    'lunar-phase-day',
    {
      title: 'Lunar Phase of the Day',
      description: 'Current lunar phase, sign, and recommended activities for the date and location.',
      argsSchema: {
        date: z.string().describe('Date YYYY-MM-DD'),
        latitude: z.string().describe('Latitude in decimal degrees'),
        longitude: z.string().describe('Longitude in decimal degrees'),
        language: langCompletable(),
      },
    },
    ({ date, latitude, longitude, language }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Get the lunar phase information for ${date} at lat=${latitude}, lon=${longitude} using the AstroWay API.

Workflow:
1. Fetch lunar phase data for the day at the location.
2. Note: phase name + percent illumination, moon sign, lunar day (1-30), void-of-course window if any.

Synthesis:
- **Phase**: name + waxing/waning, illumination %.
- **Moon in [sign]**: emotional/practical flavor of the day.
- **Lunar day**: traditional meaning + 1-2 activities aligned with it.
- **Void-of-course**: if any, the window + advice (delay decisions, finish tasks).

Output language: ${language ?? 'en'}. Practical guidance, not "the moon's energy is shifting".`,
          },
        },
      ],
    }),
  );
  count++;

  // 12. retrograde-warning
  server.registerPrompt(
    'retrograde-warning',
    {
      title: 'Retrograde Warning',
      description: 'List currently retrograde planets and what each actually affects (only flag retrogrades that touch active areas).',
      argsSchema: {
        targetDate: z.string().optional().describe('Date YYYY-MM-DD (default: today)'),
        language: langCompletable(),
      },
    },
    ({ targetDate, language }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Check which planets are retrograde on ${targetDate ?? 'today'} and what they actually affect, using the AstroWay API.

Workflow:
1. Fetch transit / planetary status for the target date.
2. Identify which planets are currently in retrograde motion.
3. For each retrograde planet, note station dates (start/end of retrograde).

Synthesis:
- For each retrograde planet:
  - Which house/sign it's transiting through right now.
  - Concrete life areas affected (Mercury → communication/contracts; Venus → relationships/values; Mars → ambition/action).
  - Realistic timeline of impact (start of retrograde to direct station + 2-week shadow).
  - 1 useful action vs. 1 thing to defer.
- Skip the moralizing — retrograde isn't "bad", it's a pacing change.

Output language: ${language ?? 'en'}.`,
          },
        },
      ],
    }),
  );
  count++;

  return count;
}
