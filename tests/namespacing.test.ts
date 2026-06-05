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
