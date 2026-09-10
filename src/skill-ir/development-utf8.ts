/** Decode bound development bytes without replacement or BOM removal. */
export function decodeDevelopmentUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("Invalid UTF-8 development input");
  }
}
