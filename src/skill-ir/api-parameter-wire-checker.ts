/** Independent inverse oracle. No import from the encoder and no reported normalized style. */
export function verifyApiParameterWire(parameter: unknown, expected: unknown, wire: unknown): { status: "pass" | "fail" | "unsupported"; reason: string | null } {
  const unsupported = (reason: string) => ({ status: "unsupported" as const, reason });
  if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) return unsupported("parameter object");
  const p = parameter as Record<string, any>;
  if (typeof p.name !== "string" || !p.name || !["query", "cookie", "path", "header"].includes(p.in)
    || p.content !== undefined || p.allowReserved === true) return unsupported("identity/content/reserved");
  const array = Array.isArray(expected), values = array ? expected : [expected];
  if (!values.length || values.length > 64 || values.some((v) => !["string", "boolean", "number"].includes(typeof v)
    || (typeof v === "number" && !Number.isFinite(v)))) return unsupported("primitive values required");
  const text = values.map(String);
  if (text.some((s) => s.length > 512 || /[\x00-\x1f\x7f]/u.test(s))) return unsupported("unsafe atoms");
  const style = p.style === undefined ? ({ query: "form", cookie: "form", path: "simple", header: "simple" } as const)[p.in as "query"] : p.style;
  const explode = p.explode === undefined ? style === "form" : p.explode;
  if (typeof explode !== "boolean") return unsupported("explode");
  if (p.in === "header" && (text.some((s) => /[,\x80-\uffff]/u.test(s)) || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(p.name))) return unsupported("header ambiguity");
  const simple = style === "simple" && (p.in === "path" || p.in === "header");
  const form = style === "form" && (p.in === "query" || p.in === "cookie");
  const delimited = p.in === "query" && array && explode === false && ["pipeDelimited", "spaceDelimited"].includes(style);
  if (!simple && !form && !delimited) return unsupported("style/location");
  if (style === "spaceDelimited" && text.some((s) => s.includes(" "))) return unsupported("ambiguous space atom");
  try {
    if (typeof wire !== "string") throw new Error("wire string required");
    const decode = (s: string) => {
      if (p.in === "header") return s;
      if (/[^A-Za-z0-9_.~%\-]/u.test(s)) throw new Error("unescaped URI atom");
      return decodeURIComponent(s);
    };
    let actual: string[];
    if (simple) actual = (array ? wire.split(",") : [wire]).map(decode);
    else {
      const pairs = wire.split("&").map((pair) => {
        const at = pair.indexOf("=");
        if (at < 0 || decodeURIComponent(pair.slice(0, at)) !== p.name) throw new Error("parameter name mismatch");
        return pair.slice(at + 1);
      });
      if (form && explode && array) actual = pairs.map(decode);
      else {
        if (pairs.length !== 1) throw new Error("unexpected duplicate parameter");
        const delimiter = style === "pipeDelimited" ? "|" : style === "spaceDelimited" ? "%20" : ",";
        actual = (array ? pairs[0]!.split(delimiter) : pairs).map(decode);
      }
    }
    if (JSON.stringify(actual) !== JSON.stringify(text)) throw new Error("decoded parameter differs from expected source value");
    return { status: "pass", reason: null };
  } catch (error) { return { status: "fail", reason: String(error) }; }
}
