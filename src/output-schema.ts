import { z } from 'zod';

/**
 * The generated OUTPUT_SCHEMAS are inferred from openapi.json and only capture a
 * subset of each response's fields. Zod v4 objects are closed by default
 * (`additionalProperties: false`), so a strict client — Claude Desktop, or the
 * SDK Client itself — rejects any real response that carries fields the inferred
 * schema omitted, with "Structured content does not match the tool's output
 * schema". Mirror what the input schemas already do (`.catchall(z.any())`):
 * recursively reopen every object so known fields stay typed for the LLM while
 * unlisted fields pass validation. Drift-proof: new API fields never break a call.
 */
export function deepOpenOutput(s: z.ZodTypeAny): z.ZodTypeAny {
  if (s instanceof z.ZodObject) {
    const shape = s.shape as Record<string, z.ZodTypeAny>;
    const next: Record<string, z.ZodTypeAny> = {};
    for (const k of Object.keys(shape)) next[k] = deepOpenOutput(shape[k]);
    return z.object(next).catchall(z.any().nullable());
  }
  if (s instanceof z.ZodArray) return z.array(deepOpenOutput(s.element as z.ZodTypeAny));
  if (s instanceof z.ZodOptional) return deepOpenOutput(s.unwrap() as z.ZodTypeAny).optional();
  if (s instanceof z.ZodNullable) return deepOpenOutput(s.unwrap() as z.ZodTypeAny).nullable();
  if (s instanceof z.ZodDefault) {
    const def = (s as any).def ?? (s as any)._zod?.def;
    if (def?.innerType) return deepOpenOutput(def.innerType).default(def.defaultValue);
  }
  if (s instanceof z.ZodUnion) {
    const opts = (s as any).options ?? (s as any).def?.options ?? (s as any)._zod?.def?.options;
    if (Array.isArray(opts) && opts.length) return z.union(opts.map(deepOpenOutput) as any);
  }
  if (s instanceof z.ZodIntersection) {
    const def = (s as any).def ?? (s as any)._zod?.def;
    if (def?.left && def?.right) return z.intersection(deepOpenOutput(def.left), deepOpenOutput(def.right));
  }
  return s; // scalars, z.any(), z.record(...) — no closed-object constraint to open
}
