const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * Builds the human-facing skill view used inside a verified artifact package.
 * The source authority continues to bind the original bytes; this derived view
 * changes only CRLF line endings to LF so its closure is checkout-independent.
 */
export function normalizeDerivedSkillView(sourceBytes: Uint8Array): Buffer {
  let text: string;
  try {
    text = utf8Decoder.decode(sourceBytes);
  } catch {
    throw new Error("verified artifact skill source must be valid UTF-8");
  }
  return Buffer.from(text.replace(/\r\n/gu, "\n"), "utf8");
}
