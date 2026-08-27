import { lstat, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(500).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));

export const ReadonlyReviewedAotRowSchema = z.object({
  taskId: z.enum([
    "env-manager-scorer-authority-node-dev-001",
    "env-manager-scorer-authority-vite-dev-002",
  ]),
  repetition: z.union([z.literal(1), z.literal(2)]),
  system: z.enum(["original", "reviewed-aot"]),
  paid: z.boolean(),
}).strict();
export type ReadonlyReviewedAotRow = z.infer<typeof ReadonlyReviewedAotRowSchema>;

export const ReadonlyFrozenFileSchema = z.object({
  path: SafePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ReadonlySerialAuthoritySchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-readonly-authority/v1"),
  experimentId: z.string().min(1),
  identityDigest: Sha256Schema,
  planSha256: Sha256Schema,
  rows: z.array(ReadonlyReviewedAotRowSchema).min(1),
  frozenFiles: z.array(ReadonlyFrozenFileSchema).min(1),
}).strict().superRefine((authority, context) => {
  const paths = authority.frozenFiles.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: "custom", message: "read-only authority contains duplicate frozen paths" });
  }
});
export type ReadonlySerialAuthority = z.infer<typeof ReadonlySerialAuthoritySchema>;

export const ReadonlySerialPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-readonly-serial-plan/v1"),
  experimentId: z.string().min(1),
  identityDigest: Sha256Schema,
  rows: z.array(ReadonlyReviewedAotRowSchema).min(1),
  originalPlan: z.array(z.unknown()),
  preparedBundle: z.object({
    relativePath: SafePathSchema,
    sha256: Sha256Schema,
  }).strict().optional(),
  accounting: z.object({
    paidCalls: z.literal(0),
    matrixExecuted: z.literal(false),
    retries: z.literal(0),
  }).strict(),
}).strict();
export type ReadonlySerialPlan = z.infer<typeof ReadonlySerialPlanSchema>;

export const ReadonlySerialStateSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1"),
  experimentId: z.string().min(1),
  identityDigest: Sha256Schema,
  planSha256: Sha256Schema,
  phase: z.enum(["prepared", "running", "done", "failed"]),
  completedRows: z.number().int().nonnegative(),
  dispatchCount: z.number().int().nonnegative(),
  inFlightRowIndex: z.number().int().nonnegative().nullable(),
  failure: z.string().min(1).nullable(),
}).strict().superRefine((state, context) => {
  if (state.dispatchCount < state.completedRows) {
    context.addIssue({ code: "custom", message: "serial state dispatch accounting drift" });
  }
  if (state.inFlightRowIndex !== null && state.inFlightRowIndex !== state.completedRows) {
    context.addIssue({ code: "custom", message: "serial state in-flight row is not the strict next row" });
  }
  if (state.phase === "prepared" && (state.completedRows !== 0 || state.dispatchCount !== 0
    || state.inFlightRowIndex !== null || state.failure !== null)) {
    context.addIssue({ code: "custom", message: "prepared serial state is not a fresh 0-row identity" });
  }
  if (state.phase === "failed" && state.failure === null) {
    context.addIssue({ code: "custom", message: "failed serial state requires a failure" });
  }
});
export type ReadonlySerialState = z.infer<typeof ReadonlySerialStateSchema>;

export const ReadonlySerialPrefixEntrySchema = z.object({
  row: ReadonlyReviewedAotRowSchema,
  raw: z.unknown(),
  scored: z.unknown(),
  originalEnvelope: z.unknown().nullable(),
  scorerDurationMs: z.number().finite().nonnegative(),
}).strict();
export type ReadonlySerialPrefixEntry = z.infer<typeof ReadonlySerialPrefixEntrySchema>;

export type ReadonlyTreeSnapshot = {
  treeSha256: string;
  entries: Array<{
    path: string;
    kind: "directory" | "file";
    bytes: number | null;
    sha256: string | null;
  }>;
};

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function contained(rootDirInput: string, path: string): string {
  const rootDir = resolve(rootDirInput);
  const candidate = resolve(rootDir, SafePathSchema.parse(path));
  const fromRoot = relative(rootDir, candidate);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`read-only authority path escapes root: ${path}`);
  }
  return candidate;
}

async function verifyFrozenFiles(rootDir: string, authority: ReadonlySerialAuthority): Promise<void> {
  await Promise.all(authority.frozenFiles.map(async (reference) => {
    const path = contained(rootDir, reference.path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`read-only frozen authority is not a regular file: ${reference.path}`);
    }
    if (sha256Bytes(await readFile(path)) !== reference.sha256) {
      throw new Error(`frozen byte digest mismatch for ${reference.path}`);
    }
  }));
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readSnapshot(options: {
  rootDir: string;
  activeDir: string;
  authority: ReadonlySerialAuthority;
}): Promise<{
  authority: ReadonlySerialAuthority;
  plan: ReadonlySerialPlan;
  state: ReadonlySerialState;
  prefix: ReadonlySerialPrefixEntry[];
}> {
  const authority = ReadonlySerialAuthoritySchema.parse(options.authority);
  await verifyFrozenFiles(options.rootDir, authority);
  const planPath = resolve(options.activeDir, "plan.json");
  const planBytes = await readFile(planPath);
  if (sha256Bytes(planBytes) !== authority.planSha256) throw new Error("read-only plan digest mismatch");
  const plan = ReadonlySerialPlanSchema.parse(JSON.parse(planBytes.toString("utf8")));
  const state = ReadonlySerialStateSchema.parse(await readJson(resolve(options.activeDir, "serial-state.json")));
  const prefixRaw = await readJson(resolve(options.activeDir, "matrix-prefix.json"));
  if (!Array.isArray(prefixRaw)) throw new Error("read-only serial prefix must be an array");
  const prefix = prefixRaw.map((entry) => ReadonlySerialPrefixEntrySchema.parse(entry));
  if (plan.experimentId !== authority.experimentId || plan.identityDigest !== authority.identityDigest
    || state.experimentId !== authority.experimentId || state.identityDigest !== authority.identityDigest
    || state.planSha256 !== authority.planSha256 || !isDeepStrictEqual(plan.rows, authority.rows)) {
    throw new Error("read-only serial identity drift");
  }
  const terminalPendingCommit = state.inFlightRowIndex !== null
    && prefix.length === state.completedRows + 1;
  if (state.completedRows > authority.rows.length || state.dispatchCount > authority.rows.length
    || (prefix.length !== state.completedRows && !terminalPendingCommit)) {
    throw new Error("read-only serial row accounting drift");
  }
  for (let index = 0; index < prefix.length; index += 1) {
    if (!isDeepStrictEqual(prefix[index]!.row, authority.rows[index])) {
      throw new Error(`read-only serial prefix identity drift at row ${index + 1}`);
    }
  }
  if (state.phase === "done" && state.completedRows !== authority.rows.length) {
    throw new Error("read-only serial done state is incomplete");
  }
  return { authority, plan, state, prefix };
}

export async function readReadonlySerialStatus(options: {
  rootDir: string;
  activeDir: string;
  authority: ReadonlySerialAuthority;
}) {
  const snapshot = await readSnapshot(options);
  return {
    experimentId: snapshot.authority.experimentId,
    phase: snapshot.state.phase,
    completedRows: snapshot.state.completedRows,
    dispatchCount: snapshot.state.dispatchCount,
    inFlightRowIndex: snapshot.state.inFlightRowIndex,
    terminalPendingCommit: snapshot.prefix.length === snapshot.state.completedRows + 1,
    failure: snapshot.state.failure,
  };
}

export async function collectReadonlySerialSnapshot(options: {
  rootDir: string;
  activeDir: string;
  authority: ReadonlySerialAuthority;
}) {
  const snapshot = await readSnapshot(options);
  return {
    experimentId: snapshot.authority.experimentId,
    phase: snapshot.state.phase,
    completedRows: snapshot.state.completedRows,
    dispatchCount: snapshot.state.dispatchCount,
    inFlightRowIndex: snapshot.state.inFlightRowIndex,
    terminalPendingCommit: snapshot.prefix.length === snapshot.state.completedRows + 1,
    failure: snapshot.state.failure,
    entries: snapshot.prefix,
  };
}

export async function snapshotReadonlyTree(rootDirInput: string): Promise<ReadonlyTreeSnapshot> {
  const rootDir = resolve(rootDirInput);
  const entries: ReadonlyTreeSnapshot["entries"] = [];
  const visit = async (directory: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolute = resolve(directory, child.name);
      const path = relative(rootDir, absolute).replaceAll("\\", "/");
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`read-only tree contains a symbolic link: ${path}`);
      if (stat.isDirectory()) {
        entries.push({ path, kind: "directory", bytes: null, sha256: null });
        await visit(absolute);
      } else if (stat.isFile()) {
        const bytes = await readFile(absolute);
        entries.push({ path, kind: "file", bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
      } else {
        throw new Error(`read-only tree contains an unsupported entry: ${path}`);
      }
    }
  };
  await visit(rootDir);
  return {
    treeSha256: sha256Bytes(Buffer.from(JSON.stringify(entries), "utf8")),
    entries,
  };
}
