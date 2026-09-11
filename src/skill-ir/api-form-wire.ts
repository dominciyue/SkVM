/** Bounded development form codec. Values are already source-schema checked. */
export function encodeApiFormBody(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("form requires a flat string object");
  const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (!entries.length || entries.length > 64) throw new Error("form field count unsupported");
  for (const [key, item] of entries) {
    if (typeof item !== "string") throw new Error("form scalar coercion unsupported");
    for (const text of [key, item]) {
      // encodeURIComponent throws for lone surrogates; URLSearchParams would replace them.
      encodeURIComponent(text);
      if (Buffer.byteLength(text, "utf8") > 4096) throw new Error("form field byte budget");
    }
  }
  const wire = new URLSearchParams(entries as Array<[string, string]>).toString();
  if (Buffer.byteLength(wire, "utf8") > 262144) throw new Error("form body byte budget");
  return wire;
}
