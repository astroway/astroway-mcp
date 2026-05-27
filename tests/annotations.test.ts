import { describe, it, expect } from 'vitest';
import { classifyAnnotations } from '../scripts/generate-tools.js';

describe('classifyAnnotations', () => {
  it('Webhooks → not read-only, not idempotent, openWorld', () => {
    expect(classifyAnnotations('Webhooks', 'webhooks_register')).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it('Reports group → creates persistent record, not idempotent', () => {
    expect(classifyAnnotations('Reports', 'reports_natal')).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it('AI Reports → creates persistent record, not idempotent', () => {
    expect(classifyAnnotations('AI Reports', 'reports_ai_synastry')).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it('Real-time Streaming → not idempotent', () => {
    const a = classifyAnnotations('Real-time Streaming', 'sse_transit_subscribe');
    expect(a.readOnlyHint).toBe(false);
    expect(a.idempotentHint).toBe(false);
    expect(a.openWorldHint).toBe(true);
  });

  it('AI Interpretations → read-only but LLM nondeterminism', () => {
    expect(classifyAnnotations('AI Interpretations', 'interpret_natal')).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it('AI & MCP group → LLM nondeterminism', () => {
    const a = classifyAnnotations('AI & MCP', 'mcp_some_tool');
    expect(a.readOnlyHint).toBe(true);
    expect(a.idempotentHint).toBe(false);
    expect(a.openWorldHint).toBe(true);
  });

  it('interpret_* prefix triggers AI rule even with non-AI group', () => {
    const a = classifyAnnotations('Core', 'interpret_chart_summary');
    expect(a.idempotentHint).toBe(false);
    expect(a.openWorldHint).toBe(true);
  });

  it('*_ai_* in name triggers AI rule', () => {
    const a = classifyAnnotations('Reports', 'reports_ai_natal_narrative');
    // Reports rule wins first — also AI, but not idempotent regardless
    expect(a.idempotentHint).toBe(false);
  });

  it('Core / Vedic / Tarot / Numerology → fully read-only and idempotent', () => {
    const groups = ['Core', 'Vedic', 'Tarot — Rider-Waite-Smith', 'Numerology — Pythagorean', 'Reference', 'Esoteric'];
    for (const g of groups) {
      const a = classifyAnnotations(g, 'some_tool');
      expect(a).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it('Horoscope group → idempotent (cached daily content)', () => {
    expect(classifyAnnotations('Horoscope', 'horoscope_daily').idempotentHint).toBe(true);
  });

  it('group classification is case-insensitive', () => {
    expect(classifyAnnotations('webhooks', 'x').readOnlyHint).toBe(false);
    expect(classifyAnnotations('WEBHOOKS', 'x').readOnlyHint).toBe(false);
  });

  it('destructiveHint never true (no DELETE-style endpoints in this surface)', () => {
    const groups = ['Webhooks', 'Reports', 'AI Reports', 'Core', 'Vedic', 'Tarot — Lenormand'];
    for (const g of groups) {
      expect(classifyAnnotations(g, 'x').destructiveHint).toBe(false);
    }
  });
});
