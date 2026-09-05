import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { runArtifactPreset, type ArtifactPresetResult } from "../skill-ir/verified-artifact-presets";

export const ARTIFACT_PRESETS = {
  "env-manager": {
    variants: [] as const,
    description: "Env Manager reviewed AOT (machine-checked)",
  },
  "api-tester": {
    variants: ["openapi-json", "openapi-yaml"] as const,
    description: "API Tester schema-derived deterministic artifact",
  },
} as const;

export type ArtifactPresetName = keyof typeof ARTIFACT_PRESETS;
export type ApiTesterArtifactVariant = (typeof ARTIFACT_PRESETS)["api-tester"]["variants"][number];
export type ArtifactQuality = "machine-checked";

type ResolvedArtifactPreset =
  | { preset: "env-manager"; variant?: undefined }
  | { preset: "api-tester"; variant: ApiTesterArtifactVariant };

export type ArtifactCliArguments = {
  quality: ArtifactQuality;
  rootDir: string;
  workDir: string;
  outDir: string;
  completedAt: string;
} & ResolvedArtifactPreset;

const IsoDateTimeSchema = z.string().datetime();

function flagValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function portable(value: string): string {
  return value.replaceAll("\\", "/");
}

function contained(rootDir: string, value: string, label: string): string {
  if (!value.trim()) throw new Error(`--${label} must not be empty`);
  const root = resolve(rootDir);
  const target = resolve(isAbsolute(value) ? value : root + "/" + value);
  const fromRoot = relative(root, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(fromRoot)) {
    throw new Error(`--${label} must be contained by --root: ${value}`);
  }
  return target;
}

export function resolveArtifactPreset(
  preset: string,
  variant: string | undefined,
): ResolvedArtifactPreset {
  if (preset !== "env-manager" && preset !== "api-tester") {
    throw new Error(`unknown artifact preset: ${preset}`);
  }
  if (preset === "env-manager") {
    if (variant !== undefined) throw new Error("Env Manager does not accept --variant");
    return { preset };
  }
  if (variant === undefined) throw new Error("API Tester requires --variant=openapi-json|openapi-yaml");
  if (!ARTIFACT_PRESETS["api-tester"].variants.includes(variant as ApiTesterArtifactVariant)) {
    throw new Error(`unknown API Tester artifact variant: ${variant}`);
  }
  return { preset: "api-tester", variant: variant as ApiTesterArtifactVariant };
}

export function parseArtifactCliArguments(args: string[], cwd = process.cwd()): ArtifactCliArguments {
  const known = new Set([
    "--preset",
    "--variant",
    "--quality",
    "--root",
    "--workdir",
    "--out",
    "--completed-at",
  ]);
  for (const argument of args) {
    const name = argument.includes("=") ? argument.slice(0, argument.indexOf("=")) : argument;
    if (argument === "--help" || argument === "-h") continue;
    if (!known.has(name)) throw new Error(`unknown artifact option: ${name}`);
  }
  if (args.includes("--help") || args.includes("-h")) {
    throw new Error("help requested");
  }

  const presetValue = flagValue(args, "preset");
  const rootDir = resolve(cwd, flagValue(args, "root") ?? ".");
  const workdir = flagValue(args, "workdir");
  const out = flagValue(args, "out");
  if (!presetValue || !workdir || !out) {
    throw new Error("--preset, --workdir, and --out are required");
  }
  const qualityValue = flagValue(args, "quality") ?? "machine-checked";
  if (qualityValue !== "machine-checked") throw new Error("artifact CLI currently supports --quality=machine-checked only");
  const quality: ArtifactQuality = qualityValue;
  const resolved = resolveArtifactPreset(presetValue, flagValue(args, "variant"));
  const workDir = contained(rootDir, workdir, "workdir");
  const outDir = contained(rootDir, out, "out");
  if (workDir === outDir) throw new Error("--workdir and --out must be different directories");
  const completedAt = flagValue(args, "completed-at");
  if (!completedAt) throw new Error("--completed-at=<ISO-8601> is required");
  IsoDateTimeSchema.parse(completedAt);
  const common = {
    quality,
    rootDir: portable(rootDir),
    workDir: portable(workDir),
    outDir: portable(outDir),
    completedAt,
  };
  return resolved.preset === "api-tester"
    ? { ...common, preset: resolved.preset, variant: resolved.variant }
    : { ...common, preset: resolved.preset };
}

export function artifactCliHelp(): string {
  return `skvm artifact — run a verified artifact preset without model calls

Usage:
  skvm artifact --preset=env-manager --root=<root> --workdir=<dir> --out=<dir> --completed-at=<ISO-8601>
  skvm artifact --preset=api-tester --variant=<openapi-json|openapi-yaml> --root=<root> --workdir=<dir> --out=<dir> --completed-at=<ISO-8601>

Presets:
  env-manager  ${ARTIFACT_PRESETS["env-manager"].description}
  api-tester   ${ARTIFACT_PRESETS["api-tester"].description}

The command is deterministic and does not inspect API keys or dispatch model calls.`;
}

export async function runArtifactCli(args: string[], cwd = process.cwd()): Promise<ArtifactPresetResult | undefined> {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    process.stdout.write(`${artifactCliHelp()}\n`);
    return undefined;
  }
  const parsed = parseArtifactCliArguments(args, cwd);
  const result = await runArtifactPreset(parsed);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.main) {
  runArtifactCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
