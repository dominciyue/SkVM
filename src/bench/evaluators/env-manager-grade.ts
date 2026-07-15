import { spawn } from "node:child_process"
import { lstat, readFile, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

const SCHEMA_VERSION = "skill-ir-env-manager-eval/v1"

function isSafeRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value)
  ) {
    return false
  }

  const segments = value.split(/[\\/]/)
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  )
}

const SafeRelativePathSchema = z.string().refine(isSafeRelativePath, {
  message: "path must be a safe relative path",
})

const SafePathRecordSchema = z.record(z.string()).superRefine((files, ctx) => {
  for (const filePath of Object.keys(files)) {
    if (!isSafeRelativePath(filePath)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "file key must be a safe relative path",
      })
    }
  }
})

const ReportSchema = z
  .object({
    definedAndUsed: z.array(z.string()),
    definedUnconfirmedUnused: z.array(z.string()),
    usedUndefined: z.array(z.string()),
    hardcodedSecrets: z.array(z.string()),
    exposureRisks: z.array(z.string()),
  })
  .strict()

const ExpectedVariableRuleSchema = z.record(z.string(), z.unknown())

export const EnvManagerGradePayloadSchema = z.discriminatedUnion("check", [
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      check: z.literal("protected-files"),
      files: SafePathRecordSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      check: z.literal("no-secret-leak"),
      values: z.array(z.string().min(1)).min(1),
      allowedPaths: z.array(SafeRelativePathSchema),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      check: z.literal("required-artifacts"),
      files: z
        .array(
          z
            .object({
              path: SafeRelativePathSchema,
              json: z.boolean(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      check: z.literal("report-classification"),
      path: SafeRelativePathSchema,
      expected: ReportSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      check: z.literal("env-example"),
      path: SafeRelativePathSchema,
      requiredNames: z.array(z.string().min(1)).min(1),
      forbiddenValues: z.array(z.string().min(1)),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      check: z.literal("schema-rules"),
      path: SafeRelativePathSchema,
      expected: z.record(z.string().min(1), ExpectedVariableRuleSchema),
    })
    .strict(),
])

type EnvManagerGradePayload = z.infer<typeof EnvManagerGradePayloadSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>

class UnsafeFilesystemPathError extends Error {}

function passing(details: string): GradeResult {
  return { pass: true, score: 1, details }
}

function failing(details: string): GradeResult {
  return { pass: false, score: 0, details }
}

function infrastructure(details: string): GradeResult {
  return { pass: false, score: 0, details, infraError: details }
}

function portablePath(relativePath: string): string {
  return relativePath.split(/[\\/]/).join("/")
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  )
}

interface ResolvedDeclaredPath {
  exists: boolean
  path: string
  isFile: boolean
}

async function resolveDeclaredPath(
  realWorkDir: string,
  relativePath: string,
): Promise<ResolvedDeclaredPath> {
  const candidate = path.join(realWorkDir, ...relativePath.split(/[\\/]/))
  if (!isContained(realWorkDir, candidate)) {
    throw new UnsafeFilesystemPathError()
  }

  try {
    await lstat(candidate)
    const resolved = await realpath(candidate)
    if (!isContained(realWorkDir, resolved)) {
      throw new UnsafeFilesystemPathError()
    }
    const targetStat = await lstat(resolved)
    return { exists: true, path: resolved, isFile: targetStat.isFile() }
  } catch (error) {
    if (error instanceof UnsafeFilesystemPathError) throw error
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }

  let ancestor = path.dirname(candidate)
  while (isContained(realWorkDir, ancestor)) {
    try {
      const resolvedAncestor = await realpath(ancestor)
      if (!isContained(realWorkDir, resolvedAncestor)) {
        throw new UnsafeFilesystemPathError()
      }
      return { exists: false, path: candidate, isFile: false }
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) throw error
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }

    if (ancestor === realWorkDir) break
    ancestor = path.dirname(ancestor)
  }

  return { exists: false, path: candidate, isFile: false }
}

async function readDeclaredFile(
  realWorkDir: string,
  relativePath: string,
): Promise<Buffer | undefined> {
  const resolved = await resolveDeclaredPath(realWorkDir, relativePath)
  if (!resolved.exists || !resolved.isFile) return undefined
  return readFile(resolved.path)
}

async function checkProtectedFiles(
  payload: Extract<EnvManagerGradePayload, { check: "protected-files" }>,
  realWorkDir: string,
): Promise<GradeResult> {
  for (const [relativePath, expected] of Object.entries(payload.files)) {
    const actual = await readDeclaredFile(realWorkDir, relativePath)
    if (!actual || !actual.equals(Buffer.from(expected, "utf8"))) {
      return failing("Protected files are missing or changed.")
    }
  }
  return passing("Protected files match expected content.")
}

interface RegularFileTarget {
  relativePath: string
  realPath: string
}

interface WorkdirTraversal {
  files: RegularFileTarget[]
  relativePaths: string[]
  realArtifactPaths: string[]
}

const EMPTY_TRAVERSAL: WorkdirTraversal = {
  files: [],
  relativePaths: [],
  realArtifactPaths: [],
}

async function listWorkdirArtifacts(root: string): Promise<WorkdirTraversal> {
  const directoryCache = new Map<string, WorkdirTraversal>()
  const activeDirectories = new Set<string>()

  async function collect(directory: string): Promise<WorkdirTraversal> {
    const realDirectory = await realpath(directory)
    if (!isContained(root, realDirectory)) return EMPTY_TRAVERSAL

    const cached = directoryCache.get(realDirectory)
    if (cached) return cached
    if (activeDirectories.has(realDirectory)) return EMPTY_TRAVERSAL

    activeDirectories.add(realDirectory)
    try {
      const entries = await readdir(realDirectory, { withFileTypes: true })
      entries.sort((left, right) => left.name.localeCompare(right.name))

      const files: RegularFileTarget[] = []
      const relativePaths: string[] = []
      const realArtifactPaths = [realDirectory]
      for (const entry of entries) {
        relativePaths.push(entry.name)
        const resolvedTarget = await realpath(path.join(realDirectory, entry.name))
        if (!isContained(root, resolvedTarget)) continue
        realArtifactPaths.push(resolvedTarget)

        const targetStat = await lstat(resolvedTarget)
        if (targetStat.isDirectory()) {
          const nested = await collect(resolvedTarget)
          files.push(
            ...nested.files.map((file) => ({
              relativePath: path.join(entry.name, file.relativePath),
              realPath: file.realPath,
            })),
          )
          relativePaths.push(
            ...nested.relativePaths.map((relativePath) =>
              path.join(entry.name, relativePath),
            ),
          )
          realArtifactPaths.push(...nested.realArtifactPaths)
        } else if (targetStat.isFile()) {
          files.push({ relativePath: entry.name, realPath: resolvedTarget })
        }
      }

      const result = { files, relativePaths, realArtifactPaths }
      directoryCache.set(realDirectory, result)
      return result
    } finally {
      activeDirectories.delete(realDirectory)
    }
  }

  return collect(root)
}

const WINDOWS_STREAM_CHECK = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class SkvmStreamNative {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct FindStreamData {
        public long StreamSize;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 296)]
        public string StreamName;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindFirstStreamW(
        string fileName,
        int infoLevel,
        out FindStreamData data,
        int flags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool FindNextStreamW(
        IntPtr handle,
        out FindStreamData data);

    [DllImport("kernel32.dll")]
    public static extern bool FindClose(IntPtr handle);
}
'@

function Convert-ToLongPath([string] $artifactPath) {
  if ($artifactPath.StartsWith('\\')) {
    return '\\?\UNC\' + $artifactPath.Substring(2)
  }
  return '\\?\' + $artifactPath
}

$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$paths = @($request.paths)
$values = @($request.values)
$invalidHandle = [IntPtr]::new(-1)

foreach ($artifactPath in $paths) {
  $data = New-Object SkvmStreamNative+FindStreamData
  $handle = [SkvmStreamNative]::FindFirstStreamW($artifactPath, 0, [ref] $data, 0)
  if ($handle -eq $invalidHandle) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($errorCode -eq 38) { continue }
    throw 'Stream enumeration failed'
  }

  try {
    do {
      $streamName = $data.StreamName
      if ($streamName -ne '::$DATA') {
        foreach ($value in $values) {
          if ($streamName.Contains($value)) { exit 10 }
        }

        $plainName = $streamName.Substring(1, $streamName.Length - 7)
        $streamPath = (Convert-ToLongPath $artifactPath) + ':' + $plainName
        $content = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($streamPath))
        foreach ($value in $values) {
          if ($content.Contains($value)) { exit 10 }
        }
      }

      $next = New-Object SkvmStreamNative+FindStreamData
      $hasNext = [SkvmStreamNative]::FindNextStreamW($handle, [ref] $next)
      if ($hasNext) { $data = $next }
    } while ($hasNext)
  } finally {
    [void] [SkvmStreamNative]::FindClose($handle)
  }
}

exit 0
`.trim()

const WINDOWS_STREAM_TIMEOUT_MS = 10_000

async function hasSecretWindowsStream(
  artifactPaths: string[],
  secretValues: string[],
): Promise<boolean> {
  if (process.platform !== "win32" || artifactPaths.length === 0) return false

  return new Promise<boolean>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_STREAM_CHECK],
      { stdio: ["pipe", "ignore", "ignore"], windowsHide: true },
    )

    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }
    const timeout = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error("Windows stream enumeration timed out")))
    }, WINDOWS_STREAM_TIMEOUT_MS)

    child.once("error", () =>
      finish(() => reject(new Error("Windows stream enumeration failed"))),
    )
    child.stdin.once("error", () =>
      finish(() => reject(new Error("Windows stream enumeration failed"))),
    )
    child.once("close", (code) => {
      if (code === 0) finish(() => resolve(false))
      else if (code === 10) finish(() => resolve(true))
      else finish(() => reject(new Error("Windows stream enumeration failed")))
    })
    child.stdin.end(JSON.stringify({ paths: artifactPaths, values: secretValues }))
  })
}

async function checkNoSecretLeak(
  payload: Extract<EnvManagerGradePayload, { check: "no-secret-leak" }>,
  realWorkDir: string,
  output: string,
): Promise<GradeResult> {
  if (payload.values.some((value) => output.includes(value))) {
    return failing("Secret material was detected in evaluator output.")
  }

  const allowed = new Set<string>()
  for (const allowedPath of payload.allowedPaths) {
    await resolveDeclaredPath(realWorkDir, allowedPath)
    allowed.add(portablePath(allowedPath))
  }

  const traversal = await listWorkdirArtifacts(realWorkDir)
  if (
    traversal.relativePaths.some((relativePath) =>
      payload.values.some((value) => portablePath(relativePath).includes(value)),
    )
  ) {
    return failing("Secret material was detected in artifact paths.")
  }

  const realArtifactPaths = [...new Set(traversal.realArtifactPaths)]
  if (await hasSecretWindowsStream(realArtifactPaths, payload.values)) {
    return failing("Secret material was detected in alternate streams.")
  }

  const scannedTargets = new Set<string>()
  for (const file of traversal.files) {
    const relative = portablePath(file.relativePath)
    if (allowed.has(relative)) continue
    if (scannedTargets.has(file.realPath)) continue
    scannedTargets.add(file.realPath)

    const content = await readFile(file.realPath, "utf8")
    if (payload.values.some((value) => content.includes(value))) {
      return failing("Secret material was detected in generated artifacts.")
    }
  }

  return passing("No secret material was detected.")
}

async function checkRequiredArtifacts(
  payload: Extract<EnvManagerGradePayload, { check: "required-artifacts" }>,
  realWorkDir: string,
): Promise<GradeResult> {
  for (const declaration of payload.files) {
    const content = await readDeclaredFile(realWorkDir, declaration.path)
    if (!content) return failing("A required artifact is missing or invalid.")
    if (declaration.json) {
      try {
        JSON.parse(content.toString("utf8"))
      } catch {
        return failing("A required artifact is missing or invalid.")
      }
    }
  }
  return passing("Required artifacts are present and valid.")
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

async function checkReportClassification(
  payload: Extract<
    EnvManagerGradePayload,
    { check: "report-classification" }
  >,
  realWorkDir: string,
): Promise<GradeResult> {
  const content = await readDeclaredFile(realWorkDir, payload.path)
  if (!content) return failing("The classification report is missing or invalid.")

  let raw: unknown
  try {
    raw = JSON.parse(content.toString("utf8"))
  } catch {
    return failing("The classification report is missing or invalid.")
  }
  const parsed = ReportSchema.safeParse(raw)
  if (!parsed.success) {
    return failing("The classification report is missing or invalid.")
  }

  for (const field of Object.keys(payload.expected) as Array<
    keyof typeof payload.expected
  >) {
    if (
      JSON.stringify(sortedUnique(parsed.data[field])) !==
      JSON.stringify(sortedUnique(payload.expected[field]))
    ) {
      return failing("The classification report does not match expected sets.")
    }
  }

  return passing("The classification report matches expected sets.")
}

function parseDotenv(content: string): Map<string, string> | undefined {
  const values = new Map<string, string>()
  for (const line of content.split(/\r\n?|\n/)) {
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) continue
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (!match) return undefined
    values.set(match[1]!, match[2]!)
  }
  return values
}

async function checkEnvExample(
  payload: Extract<EnvManagerGradePayload, { check: "env-example" }>,
  realWorkDir: string,
): Promise<GradeResult> {
  const content = await readDeclaredFile(realWorkDir, payload.path)
  if (!content) return failing("The environment example is missing or invalid.")
  const values = parseDotenv(content.toString("utf8"))
  if (!values) return failing("The environment example is missing or invalid.")

  if (payload.requiredNames.some((name) => !values.has(name))) {
    return failing("The environment example is missing required names.")
  }
  if (
    [...values.values()].some((value) =>
      payload.forbiddenValues.some((forbidden) => value.includes(forbidden)),
    )
  ) {
    return failing("The environment example contains forbidden material.")
  }

  return passing("The environment example is complete and safe.")
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMatchesSubset(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => deepMatchesSubset(actual[index], value))
    )
  }
  if (isPlainObject(expected)) {
    return (
      isPlainObject(actual) &&
      Object.entries(expected).every(([key, value]) =>
        deepMatchesSubset(actual[key], value),
      )
    )
  }
  return Object.is(actual, expected)
}

async function checkSchemaRules(
  payload: Extract<EnvManagerGradePayload, { check: "schema-rules" }>,
  realWorkDir: string,
): Promise<GradeResult> {
  const content = await readDeclaredFile(realWorkDir, payload.path)
  if (!content) return failing("The environment schema is missing or invalid.")

  let raw: unknown
  try {
    raw = JSON.parse(content.toString("utf8"))
  } catch {
    return failing("The environment schema is missing or invalid.")
  }
  if (!isPlainObject(raw) || !isPlainObject(raw.variables)) {
    return failing("The environment schema is missing or invalid.")
  }

  for (const [variable, expectedRule] of Object.entries(payload.expected)) {
    if (!deepMatchesSubset(raw.variables[variable], expectedRule)) {
      return failing("The environment schema does not match required rules.")
    }
  }
  return passing("The environment schema matches required rules.")
}

export const envManagerGrade: CustomEvaluator = {
  validatePayload(payload) {
    EnvManagerGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }) {
    const parsed = EnvManagerGradePayloadSchema.safeParse(criterion.payload)
    if (!parsed.success) {
      return infrastructure("Invalid env-manager evaluator payload.")
    }

    try {
      const realWorkDir = await realpath(runResult.workDir)
      const workDirStat = await lstat(realWorkDir)
      if (!workDirStat.isDirectory()) {
        return infrastructure("Env-manager evaluator workdir is unavailable.")
      }

      switch (parsed.data.check) {
        case "protected-files":
          return await checkProtectedFiles(parsed.data, realWorkDir)
        case "no-secret-leak":
          return await checkNoSecretLeak(parsed.data, realWorkDir, runResult.text)
        case "required-artifacts":
          return await checkRequiredArtifacts(parsed.data, realWorkDir)
        case "report-classification":
          return await checkReportClassification(parsed.data, realWorkDir)
        case "env-example":
          return await checkEnvExample(parsed.data, realWorkDir)
        case "schema-rules":
          return await checkSchemaRules(parsed.data, realWorkDir)
      }
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) {
        return infrastructure("Unsafe env-manager evaluator filesystem path.")
      }
      return infrastructure("Env-manager evaluator filesystem failure.")
    }
  },
}

registerCustomEvaluator("skill-ir-env-manager", envManagerGrade)
