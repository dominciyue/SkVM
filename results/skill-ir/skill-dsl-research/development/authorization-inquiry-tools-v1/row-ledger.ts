export function rowState(report: { status: string } | undefined, claimed: boolean) {
  return { status: report?.status ?? (claimed ? "unsettled-claim" : "pending"), terminal: report !== undefined }
}
export function infrastructureFailure(report: { status: string; error?: string }) {
  return ["transport-failed", "provider-unavailable", "timeout-unknown", "completion-unknown", "failed", "timeout"].includes(report.status)
    || (report.status === "error" && /provider|transport|timeout|connection|rate.?limit|fetch/i.test(report.error ?? ""))
}
export function nextFailureStreak(previous: number, report: { status: string; error?: string }) {
  return infrastructureFailure(report) ? previous + 1 : 0
}
