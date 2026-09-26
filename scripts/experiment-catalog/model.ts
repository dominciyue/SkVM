export interface CatalogDiagnostic {
  code: string;
  entryId?: string;
  path: string;
  message: string;
}

export const CATALOG_SCHEMA = "skill-ir-experiment-catalog/v1";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function metricValue(value: unknown): boolean {
  return value === null || value === "unknown" || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

export function parseExperimentCatalog(value: unknown): {
  valid: boolean;
  entries: ReadonlyArray<Record<string, unknown>>;
  diagnostics: CatalogDiagnostic[];
} {
  const entries: Record<string, unknown>[] = [];
  const diagnostics: CatalogDiagnostic[] = [];
  const report = (code: string, path: string, message: string, entryId?: string) => {
    diagnostics.push({ code, path, message, ...(entryId === undefined ? {} : { entryId }) });
  };
  if (!isRecord(value)) {
    report("catalog-type", "$", "Catalog must be an object.");
    return { valid: false, entries, diagnostics };
  }
  if (value.schemaVersion !== CATALOG_SCHEMA) report("schema-version", "schemaVersion", `Expected ${CATALOG_SCHEMA}.`);
  if (!Array.isArray(value.entries)) {
    report("entries-type", "entries", "Expected an array.");
    return { valid: false, entries, diagnostics };
  }
  const seen = new Set<string>();
  value.entries.forEach((candidate, index) => {
    const base = `entries[${index}]`;
    if (!isRecord(candidate)) {
      report("entry-type", base, "Entry must be an object.");
      return;
    }
    entries.push(candidate);
    const id = typeof candidate.id === "string" ? candidate.id : undefined;
    for (const key of ["id", "stage", "status"]) {
      if (typeof candidate[key] !== "string" || !candidate[key].trim()) report("core-field", `${base}.${key}`, "Expected a non-empty string.", id);
    }
    if (id !== undefined && id.trim()) {
      if (seen.has(id)) report("duplicate-id", `${base}.id`, `Duplicate id: ${id}`, id);
      seen.add(id);
    }
    if (!isRecord(candidate.artifacts)) {
      report("artifacts-type", `${base}.artifacts`, "Expected a path map.", id);
    } else {
      for (const [key, path] of Object.entries(candidate.artifacts)) {
        if (typeof path !== "string" || !path.trim()) report("artifact-type", `${base}.artifacts.${key}`, "Expected a non-empty relative path string.", id);
      }
    }
    // Only documented telemetry containers are interpreted; extensions stay opaque.
    for (const [prefix, container] of [[base, candidate], [`${base}.provider`, candidate.provider], [`${base}.authoring`, candidate.authoring], [`${base}.scope`, candidate.scope]] as const) {
      if (!isRecord(container)) continue;
      for (const key of ["actualUsd", "actualUSD"]) {
        if (Object.hasOwn(container, key) && !metricValue(container[key])) report("metric-type", `${prefix}.${key}`, "Expected a non-negative number, null or unknown.", id);
      }
      if (!Object.hasOwn(container, "knownTokens")) continue;
      const tokens = container.knownTokens;
      if (isRecord(tokens)) {
        for (const key of ["input", "output", "cacheRead", "cacheWrite", "cache-read", "cache-write"]) {
          if (Object.hasOwn(tokens, key) && !metricValue(tokens[key])) report("metric-type", `${prefix}.knownTokens.${key}`, "Expected a non-negative number, null or unknown.", id);
        }
      } else if (!metricValue(tokens)) {
        report("metric-type", `${prefix}.knownTokens`, "Expected token dimensions or a non-negative number, null or unknown.", id);
      }
    }
  });
  return { valid: diagnostics.length === 0, entries, diagnostics };
}
