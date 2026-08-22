import { describe, it, expect } from 'vitest';
import { derivePrefix, prefixToolName } from '../scripts/generate-tools.js';
import { GENERATED_TOOLS } from '../src/tools.generated.js';

describe('derivePrefix — manual overrides', () => {
  it('Core → western', () => {
    expect(derivePrefix('Core')).toBe('western');
  });

  it('Comparisons → relational', () => {
    expect(derivePrefix('Comparisons')).toBe('relational');
  });

  it('AI Interpretations → ai (overrides "ai_")', () => {
    expect(derivePrefix('AI Interpretations')).toBe('ai');
  });

  it('Human Design → hd', () => {
    expect(derivePrefix('Human Design')).toBe('hd');
  });

  it('BaZi (Four Pillars) → bazi (drops paren noise)', () => {
    expect(derivePrefix('BaZi (Four Pillars)')).toBe('bazi');
  });

  it('Visualization → render', () => {
    expect(derivePrefix('Visualization')).toBe('render');
  });
});

describe('derivePrefix — auto-derivation for em-dash subgroups', () => {
  it('Numerology — Pythagorean → numerology', () => {
    expect(derivePrefix('Numerology — Pythagorean')).toBe('numerology');
  });

  it('Tarot — Marseille → tarot', () => {
    expect(derivePrefix('Tarot — Marseille')).toBe('tarot');
  });

  it('Hellenistic — Brennan tradition → hellenistic', () => {
    expect(derivePrefix('Hellenistic — Brennan tradition')).toBe('hellenistic');
  });

  it('Vedic (no subgroup) → vedic', () => {
    expect(derivePrefix('Vedic')).toBe('vedic');
  });

  it('Webhooks → webhooks', () => {
    expect(derivePrefix('Webhooks')).toBe('webhooks');
  });

  it('strips trailing/embedded non-alphanum', () => {
    expect(derivePrefix('Esoteric')).toBe('esoteric');
    expect(derivePrefix('Wellness')).toBe('wellness');
  });
});

describe('prefixToolName', () => {
  it('matches roadmap example: chart (Core) → astroway_western_chart', () => {
    expect(prefixToolName('chart', 'Core')).toBe('astroway_western_chart');
  });

  it('collapses duplicate prefix when tool name already starts with it', () => {
    expect(prefixToolName('vedic_dashas_vimshottari_maha', 'Vedic')).toBe('astroway_vedic_dashas_vimshottari_maha');
    expect(prefixToolName('tarot_marseille_birth_card', 'Tarot — Marseille')).toBe('astroway_tarot_marseille_birth_card');
  });

  it('lowercases everything and uses underscore separators', () => {
    expect(prefixToolName('reports_natal', 'Reports')).toBe('astroway_reports_natal');
    expect(prefixToolName('webhooks_eclipse_alert', 'Webhooks')).toBe('astroway_webhooks_eclipse_alert');
  });

  it('handles AI groups via override', () => {
    expect(prefixToolName('interpret_natal', 'AI Interpretations')).toBe('astroway_ai_interpret_natal');
  });

  it('handles Human Design alias', () => {
    expect(prefixToolName('human_design_full_chart', 'Human Design')).toBe('astroway_hd_human_design_full_chart');
  });

  it('only emits chars from [a-z0-9_]', () => {
    const samples = ['chart', 'render-wheel', 'tarot_marseille_birth_card', 'human_design_full'];
    const groups = ['Core', 'Visualization', 'Tarot — Marseille', 'Human Design'];
    for (let i = 0; i < samples.length; i++) {
      expect(prefixToolName(samples[i], groups[i])).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe('GENERATED_TOOLS prefixedName coverage', () => {
  it('every tool has a prefixedName', () => {
    for (const t of GENERATED_TOOLS) {
      expect(t.prefixedName, `${t.name} prefixedName`).toBeTruthy();
    }
  });

  it('every prefixedName starts with astroway_', () => {
    for (const t of GENERATED_TOOLS) {
      expect(t.prefixedName.startsWith('astroway_'), `${t.name} prefix`).toBe(true);
    }
  });

  it('every prefixedName matches MCP-safe pattern [a-z0-9_]', () => {
    for (const t of GENERATED_TOOLS) {
      expect(t.prefixedName).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('prefixedNames are unique across the catalogue', () => {
    const names = GENERATED_TOOLS.map((t) => t.prefixedName);
    const set = new Set(names);
    expect(set.size).toBe(names.length);
  });
});

describe('derivePrefix — the separator must not decide a tool name', () => {
  /* Group titles carried an em-dash until the em-dash sweep went through
     api-calc on 2026-08-17 and made them colons. Both the override table and
     the head split were written against the em-dash alone, so a punctuation
     change renamed 118 tools: the whole title became the prefix and
     `astroway_chinese_feng_shui_kua` came out as
     `astroway_chinese_zodiac_feng_shui_chinese_feng_shui_kua`. These tests use
     both spellings of the same group on purpose. */
  const pairs: [string, string, string][] = [
    ['Chinese — Zodiac & Feng Shui', 'Chinese: Zodiac & Feng Shui', 'chinese'],
    ['Zi Wei Dou Shu (Purple Star) — MVP', 'Zi Wei Dou Shu (Purple Star): MVP', 'ziwei'],
    ['Tarot — Rider-Waite-Smith', 'Tarot: Rider-Waite-Smith', 'tarot'],
    ['Numerology — Kabbalistic (phonetic)', 'Numerology: Kabbalistic (phonetic)', 'numerology'],
    ['Hellenistic — Hand tradition', 'Hellenistic: Hand tradition', 'hellenistic'],
  ];
  for (const [emDash, colon, expected] of pairs) {
    it(`${colon} → ${expected}, either separator`, () => {
      expect(derivePrefix(emDash)).toBe(expected);
      expect(derivePrefix(colon)).toBe(expected);
    });
  }

  it('names an agent already learned are still in the catalogue', () => {
    /* A tool name is an API. This is the check that would have caught the
       rename, because it looks at the built catalogue rather than at a
       hand-written group title. */
    const names = new Set(GENERATED_TOOLS.map((t) => t.prefixedName));
    for (const n of [
      'astroway_chinese_feng_shui_kua',
      'astroway_chinese_zodiac_animal',
      'astroway_ziwei_full_chart',
      'astroway_tarot_rider_waite_daily',
      'astroway_numerology_kabbalistic_life_path',
      'astroway_hellenistic_hand_bounds',
      'astroway_western_chart',
    ]) {
      expect(names.has(n), `${n} is missing from the catalogue`).toBe(true);
    }
  });

  it('a prefix stays a namespace, not a whole title', () => {
    /* The stale override table turned `Zi Wei Dou Shu (Purple Star): MVP` into
       the prefix `zi_wei_dou_shu_purple_star_mvp` and `Chinese: Zodiac & Feng
       Shui` into `chinese_zodiac_feng_shui`, so every tool underneath was
       renamed. A prefix is one or two words; anything longer means the split
       stopped working. */
    /* One group has always produced a long prefix, because its title carries no
       separator and no override:
       `astroway_zodiac_signs_per_sign_deep_zodiac_aries` shipped that way in
       1.2.0 and is left alone here. Adding the override would rename 12 tools,
       which is the very thing this describe block exists to prevent; it belongs
       in a release that says so and keeps the old names as aliases. */
    const KNOWN_LONG = new Set(['Zodiac Signs (Per-Sign Deep)']);
    const groups = [...new Set(GENERATED_TOOLS.map((t) => t.group))].filter((g) => !KNOWN_LONG.has(g));
    const tooLong = groups
      .map((g) => [g, derivePrefix(g)] as const)
      .filter(([, prefix]) => prefix.split('_').length > 2);
    expect(tooLong.map(([g, p]) => `${g} → ${p}`)).toEqual([]);
  });
});
