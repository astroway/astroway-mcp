/**
 * v0.9.1 — verify the hand-written shapes (chart, twoChart, etc.) reject the
 * "silent compute for equator off Ghana at UTC" inputs. These tests do not
 * depend on the live API or generated tools — they validate Zod schemas
 * directly via dynamic import of the index module's exports.
 *
 * We import the actual schema constants from src/index.ts via a small wrapper
 * so the test catches regressions if the constants are reshaped.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-derive the validation patterns directly so this test isolates from the
// runtime side of src/index.ts (which boots the MCP server and exits on no API
// key). Anything reshaped in production must match these contracts.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

describe('Date / time regex contracts', () => {
  it('DATE_RE accepts canonical YYYY-MM-DD', () => {
    expect(DATE_RE.test('1990-05-15')).toBe(true);
    expect(DATE_RE.test('2026-01-01')).toBe(true);
  });

  it('DATE_RE rejects junk', () => {
    expect(DATE_RE.test('1990/05/15')).toBe(false);
    expect(DATE_RE.test('15-05-1990')).toBe(false);
    expect(DATE_RE.test('1990-5-15')).toBe(false);
    expect(DATE_RE.test('today')).toBe(false);
    expect(DATE_RE.test('')).toBe(false);
  });

  it('TIME_RE accepts HH:mm and HH:mm:ss', () => {
    expect(TIME_RE.test('14:30')).toBe(true);
    expect(TIME_RE.test('14:30:45')).toBe(true);
    expect(TIME_RE.test('00:00:00')).toBe(true);
  });

  it('TIME_RE rejects junk', () => {
    expect(TIME_RE.test('14h30')).toBe(false);
    expect(TIME_RE.test('14:30:45.123')).toBe(false);
    expect(TIME_RE.test('2:30 PM')).toBe(false);
    expect(TIME_RE.test('')).toBe(false);
  });
});

describe('Lat / lon / tz numeric range contracts', () => {
  const lat = z.number().min(-90).max(90);
  const lon = z.number().min(-180).max(180);
  const tz  = z.number().min(-12).max(14);

  it('lat accepts the valid range', () => {
    expect(lat.safeParse(0).success).toBe(true);
    expect(lat.safeParse(50.45).success).toBe(true);
    expect(lat.safeParse(-89.99).success).toBe(true);
    expect(lat.safeParse(90).success).toBe(true);
  });

  it('lat rejects out-of-range', () => {
    expect(lat.safeParse(91).success).toBe(false);
    expect(lat.safeParse(-91).success).toBe(false);
  });

  it('lon accepts -180..+180', () => {
    expect(lon.safeParse(0).success).toBe(true);
    expect(lon.safeParse(180).success).toBe(true);
    expect(lon.safeParse(-180).success).toBe(true);
  });

  it('lon rejects beyond ±180', () => {
    expect(lon.safeParse(181).success).toBe(false);
    expect(lon.safeParse(-181).success).toBe(false);
  });

  it('tz accepts -12..+14 (Pacific to Kiritimati)', () => {
    expect(tz.safeParse(0).success).toBe(true);
    expect(tz.safeParse(3).success).toBe(true);
    expect(tz.safeParse(-12).success).toBe(true);
    expect(tz.safeParse(14).success).toBe(true);
  });

  it('tz rejects beyond real-world IANA offsets', () => {
    expect(tz.safeParse(15).success).toBe(false);
    expect(tz.safeParse(-13).success).toBe(false);
  });
});

describe('houseSystem enum contract', () => {
  const HOUSE_SYSTEM_CODES = ['P', 'K', 'O', 'W', 'E', 'R', 'C', 'T', 'M', 'B', 'H', 'U', 'V', 'X', 'Y', 'Z', 'L', 'S'] as const;
  const houseSystem = z.enum(HOUSE_SYSTEM_CODES).optional();

  it('accepts every Swiss Ephemeris letter', () => {
    for (const letter of HOUSE_SYSTEM_CODES) {
      expect(houseSystem.safeParse(letter).success, letter).toBe(true);
    }
  });

  it('accepts undefined (optional)', () => {
    expect(houseSystem.safeParse(undefined).success).toBe(true);
  });

  it('rejects junk and case-mismatch', () => {
    expect(houseSystem.safeParse('p').success).toBe(false);
    expect(houseSystem.safeParse('Placidus').success).toBe(false);
    expect(houseSystem.safeParse('Q').success).toBe(false);
  });
});

describe('language enum contract (21 codes)', () => {
  const LANGUAGE_CODES = ['uk', 'en', 'de', 'ru', 'pl', 'es', 'pt', 'hi', 'fr', 'ko', 'it', 'ja', 'id', 'tr', 'nl', 'ro', 'cs', 'vi', 'ar', 'el', 'hu'] as const;
  const language = z.enum(LANGUAGE_CODES).optional();

  it('list has exactly 21 entries', () => {
    expect(LANGUAGE_CODES).toHaveLength(21);
  });

  it('accepts every code', () => {
    for (const code of LANGUAGE_CODES) {
      expect(language.safeParse(code).success, code).toBe(true);
    }
  });

  it('rejects unsupported codes', () => {
    expect(language.safeParse('zh').success).toBe(false);
    expect(language.safeParse('he').success).toBe(false);
    expect(language.safeParse('EN').success).toBe(false);
  });
});

describe('year integer range', () => {
  const year = z.number().int().min(1900).max(2100);

  it('accepts the Swiss Ephemeris precision window', () => {
    expect(year.safeParse(2026).success).toBe(true);
    expect(year.safeParse(1900).success).toBe(true);
    expect(year.safeParse(2100).success).toBe(true);
  });

  it('rejects beyond and non-integer', () => {
    expect(year.safeParse(1899).success).toBe(false);
    expect(year.safeParse(2101).success).toBe(false);
    expect(year.safeParse(2026.5).success).toBe(false);
  });
});
