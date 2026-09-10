type Raw = Record<string, any>;
const atom = (v: unknown) => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
const escape = (s: string) => encodeURIComponent(s).replace(/[!'()*]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Bounded wire capability, not source-schema admission or an HTTP execution client. */
export function encodeApiParameter(parameter: unknown, value: unknown): { status: "encoded"; wire: string } | { status: "unsupported"; reason: string } {
  try {
    if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) throw new Error("parameter object required");
    const p = parameter as Raw;
    if (typeof p.name !== "string" || !p.name || !["path", "query", "header", "cookie"].includes(p.in)) throw new Error("parameter identity");
    if (p.in === "header" && ["accept", "content-type", "authorization"].includes(p.name.toLowerCase())) throw new Error("OpenAPI ignores this header parameter; use media/security semantics");
    if (p.content !== undefined || p.allowReserved === true) throw new Error("content/allowReserved encoding");
    const style = p.style ?? (["query", "cookie"].includes(p.in) ? "form" : "simple");
    const explode = p.explode ?? style === "form";
    if (typeof explode !== "boolean") throw new Error("invalid explode");
    if (!(style === "simple" && ["path", "header"].includes(p.in)) && !(style === "form" && ["query", "cookie"].includes(p.in))
      && !(p.in === "query" && ["spaceDelimited", "pipeDelimited"].includes(style) && explode === false && Array.isArray(value))) throw new Error("style/location/value combination");
    const values = Array.isArray(value) ? value : [value];
    if (!values.length || values.length > 64 || !values.every(atom)) throw new Error("non-primitive/empty/oversize value");
    const strings = values.map(String);
    if (strings.some((v) => v.length > 512 || /[\u0000-\u001f\u007f]/u.test(v))) throw new Error("unsafe or oversize atom");
    if (p.in === "header" && (strings.some((v) => /[,\u0080-\uffff]/u.test(v)) || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(p.name))) throw new Error("ambiguous header atom/name");
    if (style === "spaceDelimited" && strings.some((v) => v.includes(" "))) throw new Error("ambiguous space-delimited atom");
    const encoded = strings.map((s) => p.in === "header" ? s : escape(s));
    const delimiter = style === "spaceDelimited" ? "%20" : style === "pipeDelimited" ? "|" : ",";
    const wire = style === "simple" ? encoded.join(",") : style === "form" && explode && Array.isArray(value)
      ? encoded.map((s) => `${escape(p.name)}=${s}`).join("&") : `${escape(p.name)}=${encoded.join(delimiter)}`;
    return { status: "encoded", wire };
  } catch (error) { return { status: "unsupported", reason: String(error) }; }
}
