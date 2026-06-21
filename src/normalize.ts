/* LLMs routinely emit a birth/target time as HH:mm (no seconds), but api-calc
   requires strict HH:mm:ss and rejects the shorter form with a 400. We accept
   HH:mm at the tool boundary (see TIME_RE) and pad it here before the request
   leaves, so the model never has to retry just to add ":00". */

const HHMM_ONLY = /^\d{2}:\d{2}$/;

function isTimeKey(key: string): boolean {
  return key === 'time' || key.endsWith('Time') || key.endsWith('_time');
}

/** Recursively pad HH:mm → HH:mm:ss for any time-named field, including nested
    `natal.time`, `chart1.time`, and arrays like `members[].time`. */
export function normalizeTimes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeTimes);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = typeof v === 'string' && isTimeKey(k) && HHMM_ONLY.test(v)
        ? `${v}:00`
        : normalizeTimes(v);
    }
    return out;
  }
  return value;
}
