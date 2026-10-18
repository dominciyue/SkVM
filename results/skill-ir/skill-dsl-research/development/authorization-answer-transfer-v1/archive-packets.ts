// Archive-only decoder. Never used to prepare or alter model-visible data.
export function parseArchivedPacket(text: string): { packet: any; repairedEscapes: number } {
  try { return { packet: JSON.parse(text), repairedEscapes: 0 } }
  catch (error) {
    let repairedEscapes = 0
    // Email masking can consume the 'n' of a serialized newline immediately
    // before a source decorator. Retain the remaining slash and masking marker;
    // do not guess or recover the removed source text.
    const readable = text.replace(/(\\+)(?=\[redacted(?:-email)?\])/g, slashes => {
      if (slashes.length % 2 === 0) return slashes
      repairedEscapes++; return "\\" + slashes
    })
    if (!repairedEscapes) throw error
    return { packet: JSON.parse(readable), repairedEscapes }
  }
}
