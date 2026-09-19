import path from "node:path";
import {
  runLifecycle,
  type LifecycleAgent,
  type LifecycleAgentRequest,
  type LifecycleOptions,
  type LifecycleOutcome,
  type LifecycleReviewer,
} from "./lifecycle";
import type { LexicalProtectionKind } from "./units";

export type { LexicalProtectionKind } from "./units";

export interface LocalizationDeclarationV0 {
  schemaVersion: "technical-document-localization/v0";
  id: string;
  task: {
    naturalRequest: string;
    sourceLocale: string | null;
    ambiguity: "ask" | "record" | "fail";
  };
  input: {
    id: string;
    path: string;
    format: "markdown";
  };
  targets: Array<{
    id: string;
    locale: string;
    path: string;
    overwrite: "never" | "ask" | "replace";
    independent: boolean;
  }>;
  protection: {
    profile: "technical-markdown/v0";
    lexicalKinds: LexicalProtectionKind[];
  };
  policies: {
    partialTargets: "forbid" | "publish-independent";
    semanticReview: "optional" | "required";
  };
  provenance: {
    kind: "migrated-skill" | "different-source" | "direct-authored";
    source: string;
  };
}

export interface DeclarationDiagnostic {
  code: string;
  path: string;
  message: string;
}

export type DeclarationValidation =
  | { ok: true; declaration: LocalizationDeclarationV0; diagnostics: [] }
  | { ok: false; diagnostics: DeclarationDiagnostic[] };

export interface DeclarationRuntimeBindings {
  workspaceDir: string;
  interactive: boolean;
  agentTimeoutMs: number;
  agent: LifecycleAgent;
  reviewer?: LifecycleReviewer;
  beforePublish?: () => Promise<void>;
  onAgentRequest?: (request: LifecycleAgentRequest) => void;
}

const LEXICAL_KINDS = new Set<LexicalProtectionKind>([
  "url",
  "placeholder",
  "environment-variable",
  "path",
  "command",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  at: string,
  diagnostics: DeclarationDiagnostic[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      diagnostics.push({ code: "unknown-field", path: `${at}.${key}`, message: `Unknown field ${key}.` });
    }
  }
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeRelativePath(value: unknown): value is string {
  if (!nonemptyString(value) || path.isAbsolute(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  return !segments.some((segment) => segment === "" || segment === "." || segment === "..");
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function invalid(
  diagnostics: DeclarationDiagnostic[],
  code: string,
  at: string,
  message: string,
): void {
  diagnostics.push({ code, path: at, message });
}

export function validateDeclaration(value: unknown): DeclarationValidation {
  const diagnostics: DeclarationDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [{ code: "invalid-declaration", path: "$", message: "Declaration must be an object." }],
    };
  }
  unknownFields(
    value,
    ["schemaVersion", "id", "task", "input", "targets", "protection", "policies", "provenance"],
    "$",
    diagnostics,
  );
  if (value.schemaVersion !== "technical-document-localization/v0") {
    invalid(diagnostics, "unsupported-schema-version", "$.schemaVersion", "Only technical-document-localization/v0 is supported.");
  }
  if (!nonemptyString(value.id) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value.id)) {
    invalid(diagnostics, "invalid-id", "$.id", "id must be a nonempty portable identifier.");
  }

  if (!isRecord(value.task)) {
    invalid(diagnostics, "invalid-field", "$.task", "task must be an object.");
  } else {
    unknownFields(value.task, ["naturalRequest", "sourceLocale", "ambiguity"], "$.task", diagnostics);
    if (!nonemptyString(value.task.naturalRequest)) {
      invalid(diagnostics, "invalid-field", "$.task.naturalRequest", "naturalRequest is required.");
    }
    if (!(value.task.sourceLocale === null || nonemptyString(value.task.sourceLocale))) {
      invalid(diagnostics, "invalid-field", "$.task.sourceLocale", "sourceLocale must be a nonempty string or null.");
    }
    if (!enumValue(value.task.ambiguity, ["ask", "record", "fail"] as const)) {
      invalid(diagnostics, "invalid-field", "$.task.ambiguity", "ambiguity must be ask, record, or fail.");
    }
  }

  if (!isRecord(value.input)) {
    invalid(diagnostics, "invalid-field", "$.input", "input must be an object.");
  } else {
    unknownFields(value.input, ["id", "path", "format"], "$.input", diagnostics);
    if (!nonemptyString(value.input.id)) invalid(diagnostics, "invalid-field", "$.input.id", "input id is required.");
    if (!safeRelativePath(value.input.path)) {
      invalid(diagnostics, "invalid-path", "$.input.path", "input path must be a relative in-workspace file path.");
    }
    if (value.input.format !== "markdown") {
      invalid(diagnostics, "unsupported-format", "$.input.format", "Only markdown is supported in v0.");
    }
  }

  const targetIds = new Set<string>();
  const targetPaths = new Set<string>();
  if (!Array.isArray(value.targets) || value.targets.length === 0) {
    invalid(diagnostics, "invalid-field", "$.targets", "At least one target is required.");
  } else {
    value.targets.forEach((candidate, index) => {
      const at = `$.targets[${index}]`;
      if (!isRecord(candidate)) {
        invalid(diagnostics, "invalid-field", at, "target must be an object.");
        return;
      }
      unknownFields(candidate, ["id", "locale", "path", "overwrite", "independent"], at, diagnostics);
      if (!nonemptyString(candidate.id) || targetIds.has(candidate.id)) {
        invalid(diagnostics, "invalid-target-id", `${at}.id`, "target id must be nonempty and unique.");
      } else {
        targetIds.add(candidate.id);
      }
      if (!nonemptyString(candidate.locale) || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(candidate.locale)) {
        invalid(diagnostics, "invalid-target-locale", `${at}.locale`, "target locale must use a basic BCP 47-shaped tag.");
      }
      if (!safeRelativePath(candidate.path)) {
        invalid(diagnostics, "invalid-path", `${at}.path`, "target path must be a relative in-workspace file path.");
      } else {
        const normalized = candidate.path.replaceAll("\\", "/").toLowerCase();
        if (targetPaths.has(normalized)) {
          invalid(diagnostics, "duplicate-target-path", `${at}.path`, "target paths must be unique.");
        }
        targetPaths.add(normalized);
        if (
          isRecord(value.input) &&
          typeof value.input.path === "string" &&
          normalized === value.input.path.replaceAll("\\", "/").toLowerCase()
        ) {
          invalid(diagnostics, "source-target-collision", `${at}.path`, "A target cannot resolve to the source path.");
        }
      }
      if (!enumValue(candidate.overwrite, ["never", "ask", "replace"] as const)) {
        invalid(diagnostics, "invalid-field", `${at}.overwrite`, "overwrite must be never, ask, or replace.");
      }
      if (typeof candidate.independent !== "boolean") {
        invalid(diagnostics, "invalid-field", `${at}.independent`, "independent must be boolean.");
      }
    });
  }

  if (!isRecord(value.protection)) {
    invalid(diagnostics, "invalid-field", "$.protection", "protection must be an object.");
  } else {
    unknownFields(value.protection, ["profile", "lexicalKinds"], "$.protection", diagnostics);
    if (value.protection.profile !== "technical-markdown/v0") {
      invalid(diagnostics, "unsupported-protection-profile", "$.protection.profile", "Only technical-markdown/v0 is supported.");
    }
    if (!Array.isArray(value.protection.lexicalKinds)) {
      invalid(diagnostics, "invalid-field", "$.protection.lexicalKinds", "lexicalKinds must be an array.");
    } else {
      const seen = new Set<string>();
      value.protection.lexicalKinds.forEach((kind, index) => {
        if (typeof kind !== "string" || !LEXICAL_KINDS.has(kind as LexicalProtectionKind)) {
          invalid(
            diagnostics,
            "unsupported-protection-kind",
            `$.protection.lexicalKinds[${index}]`,
            `Unsupported lexical protection kind ${String(kind)}.`,
          );
        } else if (seen.has(kind)) {
          invalid(diagnostics, "duplicate-protection-kind", `$.protection.lexicalKinds[${index}]`, `Duplicate kind ${kind}.`);
        }
        if (typeof kind === "string") seen.add(kind);
      });
    }
  }

  if (!isRecord(value.policies)) {
    invalid(diagnostics, "invalid-field", "$.policies", "policies must be an object.");
  } else {
    unknownFields(value.policies, ["partialTargets", "semanticReview"], "$.policies", diagnostics);
    if (!enumValue(value.policies.partialTargets, ["forbid", "publish-independent"] as const)) {
      invalid(diagnostics, "invalid-field", "$.policies.partialTargets", "Unknown partial-target policy.");
    }
    if (!enumValue(value.policies.semanticReview, ["optional", "required"] as const)) {
      invalid(diagnostics, "invalid-field", "$.policies.semanticReview", "Unknown semantic-review policy.");
    }
    if (
      value.policies.partialTargets === "publish-independent" &&
      Array.isArray(value.targets) &&
      value.targets.some((candidate) => isRecord(candidate) && candidate.independent !== true)
    ) {
      invalid(
        diagnostics,
        "partial-independence-not-declared",
        "$.policies.partialTargets",
        "Partial publication requires every target to declare independence.",
      );
    }
  }

  if (!isRecord(value.provenance)) {
    invalid(diagnostics, "invalid-field", "$.provenance", "provenance must be an object.");
  } else {
    unknownFields(value.provenance, ["kind", "source"], "$.provenance", diagnostics);
    if (!enumValue(value.provenance.kind, ["migrated-skill", "different-source", "direct-authored"] as const)) {
      invalid(diagnostics, "invalid-field", "$.provenance.kind", "Unknown provenance kind.");
    }
    if (!nonemptyString(value.provenance.source)) {
      invalid(diagnostics, "invalid-field", "$.provenance.source", "provenance source is required.");
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, declaration: value as unknown as LocalizationDeclarationV0, diagnostics: [] };
}

export function compileDeclaration(
  declaration: LocalizationDeclarationV0,
  bindings: DeclarationRuntimeBindings,
): LifecycleOptions {
  const adapter: LifecycleAgent = bindings.onAgentRequest
    ? {
        run: async (request) => {
          bindings.onAgentRequest!(request);
          return bindings.agent.run(request);
        },
      }
    : bindings.agent;
  return {
    runId: declaration.id,
    workspaceDir: bindings.workspaceDir,
    sourceId: declaration.input.id,
    sourcePath: declaration.input.path,
    targets: declaration.targets.map((target) => ({
      id: target.id,
      locale: target.locale,
      outputPath: target.path,
      overwrite: target.overwrite,
      independent: target.independent,
    })),
    partialTargets: declaration.policies.partialTargets,
    interactive: bindings.interactive,
    agentTimeoutMs: bindings.agentTimeoutMs,
    semanticReview: declaration.policies.semanticReview,
    naturalRequest: declaration.task.naturalRequest,
    sourceLocale: declaration.task.sourceLocale,
    ambiguity: declaration.task.ambiguity,
    lexicalProtectionKinds: declaration.protection.lexicalKinds,
    agent: adapter,
    ...(bindings.reviewer ? { reviewer: bindings.reviewer } : {}),
    ...(bindings.beforePublish ? { beforePublish: bindings.beforePublish } : {}),
  };
}

export async function runDeclaration(
  value: unknown,
  bindings: DeclarationRuntimeBindings,
): Promise<LifecycleOutcome | DeclarationValidation> {
  const validation = validateDeclaration(value);
  if (!validation.ok) return validation;
  return runLifecycle(compileDeclaration(validation.declaration, bindings));
}
