/** Independent inverse codec: does not import or call the constructor/serializer. */
export function verifyApiFormBodyWire(value: unknown, wire: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof wire !== "string"
    || !wire.length || Buffer.byteLength(wire, "utf8") > 262144) return false;
  const expected = Object.entries(value);
  if (!expected.length || expected.length > 64) return false;
  const wellFormed = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = text.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return Buffer.byteLength(text, "utf8") <= 4096;
  };
  if (expected.some(([key, item]) => typeof item !== "string" || !wellFormed(key) || !wellFormed(item))) return false;
  const pairs = wire.split("&"), decoded = new Map<string, string>();
  if (pairs.length !== expected.length) return false;
  try {
    const decode = (token: string) => {
      if (!/^(?:[A-Za-z0-9*._+\-]|%[0-9a-fA-F]{2})*$/u.test(token)) throw new Error("form token syntax");
      return decodeURIComponent(token.replaceAll("+", " "));
    };
    for (const pair of pairs) {
      const separator = pair.indexOf("=");
      if (separator < 0) return false;
      const key = decode(pair.slice(0, separator)), item = decode(pair.slice(separator + 1));
      if (decoded.has(key)) return false;
      decoded.set(key, item);
    }
  } catch { return false; }
  return expected.every(([key, item]) => decoded.has(key) && decoded.get(key) === item);
}
