import { createHash } from "node:crypto"

export type Rating = { support: "supported" | "incomplete" | "unsupported" | "blocked"; outcome: "determinate" | "conditional" | "unresolved" | "blocked" }
export type ReviewedRow = { id: string; status: string; firstDeliveryComplete: boolean; first: Rating; final: Rating }

export function assertPacketArchiveBound(
  packet: { reportSha256: string; runSha256: string | null },
  reportBytes: Buffer,
  runBytes: Buffer | null,
) {
  const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
  if (digest(reportBytes) !== packet.reportSha256) throw new Error("AN raw report changed after review packet creation")
  if ((runBytes === null ? null : digest(runBytes)) !== packet.runSha256) throw new Error("AN raw run changed after review packet creation")
}

export function summarizeReviewedRows(rows: ReviewedRow[]) {
  return {
    planned: rows.length,
    completed: rows.filter(row => row.status === "completed").length,
    firstDeliveryComplete: rows.filter(row => row.firstDeliveryComplete).length,
    firstSupported: rows.filter(row => row.first.support === "supported").length,
    finalSupported: rows.filter(row => row.final.support === "supported").length,
    finalDeterminate: rows.filter(row => row.final.outcome === "determinate").length,
    finalConditional: rows.filter(row => row.final.outcome === "conditional").length,
    finalBlocked: rows.filter(row => row.final.support === "blocked" || row.final.outcome === "blocked").length,
  }
}
