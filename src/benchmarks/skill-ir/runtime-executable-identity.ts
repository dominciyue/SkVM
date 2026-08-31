import { lstat, readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { sha256Bytes } from "./source-fixture";

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);

export const RuntimeExecutableIdentitySchema = z.object({
  schemaVersion: z.literal("skill-ir-runtime-executable-identity/v1"),
  resolution: z.literal("process.execPath"),
  pathPolicy: z.object({
    absoluteRequired: z.literal(true),
    regularFileRequired: z.literal(true),
    symbolicLinkForbidden: z.literal(true),
    persistedAbsolutePath: z.literal(false),
  }).strict(),
  executable: z.object({
    sha256: DigestSchema,
    bytes: z.number().int().positive(),
    bunVersion: z.string().min(1),
  }).strict(),
  smoke: z.object({
    args: z.tuple([z.literal("--version")]),
    exitCode: z.literal(0),
    observedVersion: z.string().min(1),
    stdoutSha256: DigestSchema,
    stderrSha256: DigestSchema,
  }).strict(),
}).strict();

export type RuntimeExecutableIdentity = z.infer<typeof RuntimeExecutableIdentitySchema>;

async function runVersionSmoke(executable: string) {
  const proc = Bun.spawn([executable, "--version"], {
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, 30_000);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).arrayBuffer(),
    ]);
    if (timedOut) throw new Error("runtime executable version smoke timed out");
    const stdoutBytes = Buffer.from(stdout);
    const stderrBytes = Buffer.from(stderr);
    const observedVersion = stdoutBytes.toString("utf8").trim();
    if (exitCode !== 0 || observedVersion !== Bun.version) {
      throw new Error(`runtime executable version smoke failed: exit=${exitCode}`);
    }
    return {
      args: ["--version"] as ["--version"],
      exitCode: 0 as const,
      observedVersion,
      stdoutSha256: sha256Bytes(stdoutBytes),
      stderrSha256: sha256Bytes(stderrBytes),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function qualifyCurrentRuntimeExecutable(): Promise<RuntimeExecutableIdentity> {
  const executable = process.execPath;
  if (!isAbsolute(executable)) throw new Error("process.execPath must be absolute");
  const stat = await lstat(executable);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("process.execPath must be a regular non-symlink file");
  }
  const bytes = await readFile(executable);
  return RuntimeExecutableIdentitySchema.parse({
    schemaVersion: "skill-ir-runtime-executable-identity/v1",
    resolution: "process.execPath",
    pathPolicy: {
      absoluteRequired: true,
      regularFileRequired: true,
      symbolicLinkForbidden: true,
      persistedAbsolutePath: false,
    },
    executable: {
      sha256: sha256Bytes(bytes),
      bytes: bytes.byteLength,
      bunVersion: Bun.version,
    },
    smoke: await runVersionSmoke(executable),
  });
}

export async function resolveQualifiedRuntimeExecutable(
  expectedInput: RuntimeExecutableIdentity,
): Promise<string> {
  const expected = RuntimeExecutableIdentitySchema.parse(expectedInput);
  const actual = await qualifyCurrentRuntimeExecutable();
  if (!isDeepStrictEqual(actual, expected)) throw new Error("runtime executable identity drift");
  return process.execPath;
}

export function bindQualifiedRuntimeExecutableCommand(command: string[], executable: string): string[] {
  if (command[0] !== "bun") throw new Error("runtime binding requires a literal bun command input");
  if (!isAbsolute(executable)) throw new Error("qualified runtime executable must be absolute");
  return [executable, ...command.slice(1)];
}
