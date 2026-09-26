import { isRecord } from "./model";

export function selectEntries(entries: ReadonlyArray<Record<string, unknown>>, filter: { id?: string; stage?: string } = {}): ReadonlyArray<Record<string, unknown>> {
  return entries.filter((entry) => (filter.id === undefined || entry.id === filter.id) && (filter.stage === undefined || entry.stage === filter.stage));
}
export function renderExperimentEntry(entry: Record<string, unknown>): string {
  const lines = [`${JSON.stringify(entry.id)} [${JSON.stringify(entry.stage)}] status: ${JSON.stringify(entry.status)}`];
  lines.push("Review: pending means not evaluated; absent schema/transport/semantic review fields mean not recorded. Raw outcomes do not imply quality.");
  for (const [key, value] of Object.entries(entry)) {
    if (["id", "stage", "status"].includes(key)) continue;
    if (["provider", "authoring", "scope", "rawOutcome", "artifacts"].includes(key) && isRecord(value) && Object.keys(value).length > 0) {
      for (const [field, raw] of Object.entries(value)) {
        if (field === "knownTokens" && isRecord(raw) && Object.keys(raw).length > 0) {
          for (const [dimension, count] of Object.entries(raw)) lines.push(`${key}.${field}.${dimension}: ${JSON.stringify(count)}`);
        } else {
          lines.push(`${key}.${field}: ${JSON.stringify(raw)}`);
        }
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("Complex values above are literal JSON; --format=json preserves the full entry structure. No totals or quality scores are inferred.");
  return lines.join("\n");
}
