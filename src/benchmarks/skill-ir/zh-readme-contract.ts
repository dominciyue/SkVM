import { readFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { sha256Bytes } from "./source-fixture.ts"

const SKILL_ID = "zh-readme"
const EVALUATOR_ID = "skill-ir-zh-readme"
const INTERFACE_ID = "zh-readme-repository-fact-interface-v1"
const UPSTREAM_COMMIT = "1e221579b0504082d25d5548b194399a7785f10f"
const UPSTREAM_SKILL_SHA256 = "e30e84d26619413df6e2f5a02c0392f54f027acb7d8333545e62c336551be85b"
const UPSTREAM_LICENSE_SHA256 = "494baa32c21079f6ab4cb73815fa8b119045e22f0d8b5c2bd553c4a0905ac1b2"
const SKILL_SHA256 = UPSTREAM_SKILL_SHA256
const LICENSE_SHA256 = "0137c0bf5ebe749bb97f8af36adbae05ed9bd19cc1f01ff30553173adb0544f7"
const NonEmptyStringSchema = z.string().trim().min(1)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const ZH_README_DEVELOPMENT_TASK_IDS = [
  "zh-readme-node-cli-dev-001",
  "zh-readme-python-library-dev-002",
] as const

export const ZH_README_HELDOUT_TASK_IDS = [
  "zh-readme-node-worker-heldout-001",
  "zh-readme-python-cli-heldout-002",
] as const

const PublicInterfaceSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-readme-interface/v1"),
  interfaceId: z.literal(INTERFACE_ID),
  protectedInputs: z.tuple([z.literal("<repository-files>"), z.literal("readme-interface.json")]),
  outputs: z.tuple([z.literal("README.zh-CN.md")]),
  language: z.object({ primary: z.literal("zh-CN"), technicalEnglishAllowed: z.literal(true) }).strict(),
  semanticRoles: z.tuple([
    z.literal("identity"), z.literal("installation"), z.literal("quickstart"),
    z.literal("development"), z.literal("license"),
  ]),
  factPolicy: z.object({
    sources: z.tuple([
      z.literal("project-manifest"), z.literal("entry-source"),
      z.literal("existing-documentation"), z.literal("license"),
    ]),
    commandsMustBeSourceDerived: z.literal(true),
    pathsMustExist: z.literal(true),
    linksMustBeSourceDeclared: z.literal(true),
    missingEvidence: z.literal("omit-or-mark-pending"),
    exactWordingRequired: z.literal(false),
    headingOrderRequired: z.literal(false),
  }).strict(),
  optionalPresentation: z.object({
    badges: z.literal(true), emoji: z.literal(true), socialProofOnlyWhenSourceDeclared: z.literal(true),
  }).strict(),
  resourcePolicy: z.object({
    network: z.literal(false), packageInstall: z.literal(false), executeProjectCode: z.literal(false),
    allowedRuntime: z.literal("node"),
  }).strict(),
  outputPolicy: z.object({ exactOutputSet: z.literal(true), protectedInputsMutable: z.literal(false) }).strict(),
}).strict()

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")

const EvalPayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-readme-eval/v1"),
  check: z.enum(["artifact-integrity", "chinese-structure", "command-fidelity", "reference-fidelity", "fact-completeness"]),
  paths: z.object({ interface: z.literal("readme-interface.json"), readme: z.literal("README.zh-CN.md") }).strict(),
  protectedSha256: z.record(SafeRelativePathSchema, Sha256Schema)
    .refine((value) => Object.keys(value).length >= 2, "at least two protected files are required"),
}).strict()

const TaskSchema = z.object({
  id: NonEmptyStringSchema,
  split: z.enum(["development", "heldout"]),
  prompt: NonEmptyStringSchema,
  fixtures: z.record(SafeRelativePathSchema, z.string().min(1)),
  successCriteria: z.array(z.string()).length(0),
  eval: z.array(z.object({
    method: z.literal("custom"), id: NonEmptyStringSchema, name: NonEmptyStringSchema,
    weight: z.number().positive(), evaluatorId: z.literal(EVALUATOR_ID), payload: EvalPayloadSchema,
  }).strict()).length(5),
  hardGateIds: z.array(NonEmptyStringSchema).length(5),
  passThreshold: z.literal(1),
}).strict()

export const ZhReadmeTaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal(SKILL_ID),
  tasks: z.tuple([TaskSchema, TaskSchema]),
}).strict()

export type ZhReadmeTaskSet = z.infer<typeof ZhReadmeTaskSetSchema>

const EVALUATORS = [
  ["readme-artifact-integrity", "Protected repository and exact output contract", 0.2, "artifact-integrity"],
  ["readme-chinese-structure", "Chinese README covers the public semantic roles", 0.2, "chinese-structure"],
  ["readme-command-fidelity", "Commands are supported by repository evidence", 0.2, "command-fidelity"],
  ["readme-reference-fidelity", "Paths and links are source-derived", 0.2, "reference-fidelity"],
  ["readme-fact-completeness", "Project identity and license facts are complete", 0.2, "fact-completeness"],
] as const

const TASK_PROMPT = [
  "Inspect every protected repository file and read readme-interface.json without modifying any input.",
  "Create a Chinese README.zh-CN.md that explains the project identity and includes source-supported installation, quick-start, development, and license information.",
  "Use only commands, local paths, and links supported by repository evidence; omit or mark unsupported facts as pending.",
  "Produce exactly README.zh-CN.md. Do not use the network, install packages, or execute project code.",
].join(" ")

type TaskFixture = { id: string; split: "development" | "heldout"; files: Record<string, string> }

const DEVELOPMENT_FIXTURES: readonly [TaskFixture, TaskFixture] = [
  {
    id: ZH_README_DEVELOPMENT_TASK_IDS[0],
    split: "development",
    files: {
      "package.json": `${JSON.stringify({
        name: "echo-lab", version: "1.2.0", description: "Filter JSON Lines events into concise terminal summaries.",
        license: "MIT", homepage: "https://example.org/echo-lab/docs",
        repository: { type: "git", url: "https://github.com/example/echo-lab" },
        bin: { "echo-lab": "src/cli.js" },
        scripts: { start: "node src/cli.js", test: "node --test", lint: "node --check src/cli.js" },
      }, null, 2)}\n`,
      "src/cli.js": `export function summarize(line) { return JSON.parse(line).message }\n// Usage: echo-lab --input events.jsonl --level warn\n`,
      "README.md": "# Echo Lab\n\nCommand-line JSON Lines event summaries.\n",
      "LICENSE": "MIT License\n",
    },
  },
  {
    id: ZH_README_DEVELOPMENT_TASK_IDS[1],
    split: "development",
    files: {
      "pyproject.toml": `[project]\nname = "note-index"\nversion = "0.4.0"\ndescription = "Build a searchable index from local Markdown notes."\nrequires-python = ">=3.11"\nlicense = { text = "Apache-2.0" }\n\n[project.urls]\nHomepage = "https://example.org/note-index"\nRepository = "https://github.com/example/note-index"\n\n[project.scripts]\nnote-index = "note_index.cli:main"\n`,
      "src/note_index/cli.py": `def main():\n    \"\"\"Index Markdown files from a local directory.\"\"\"\n`,
      "docs/USAGE.md": "# Usage\n\n```bash\npython -m pip install .\nnote-index scan notes/\npython -m pytest\n```\n",
      "LICENSE": "Apache License\nVersion 2.0\n",
    },
  },
]

const HELDOUT_FIXTURES: readonly [TaskFixture, TaskFixture] = [
  {
    id: ZH_README_HELDOUT_TASK_IDS[0],
    split: "heldout",
    files: {
      "package.json": `${JSON.stringify({
        name: "maple-worker", version: "2.1.0", description: "Process local CSV jobs with a bounded worker pool.",
        license: "BSD-3-Clause", repository: "https://github.com/example/maple-worker",
        scripts: { start: "node src/worker.js", test: "node --test test" },
      }, null, 2)}\n`,
      "src/worker.js": "export async function run(queue) { return queue.length }\n",
      "docs/commands.md": "```bash\nnpm install\nnpm run start\nnpm test\n```\n",
      "LICENSE": "BSD 3-Clause License\n",
    },
  },
  {
    id: ZH_README_HELDOUT_TASK_IDS[1],
    split: "heldout",
    files: {
      "pyproject.toml": `[project]\nname = "ledger-clean"\nversion = "1.0.0"\ndescription = "Normalize local CSV ledger rows without a network service."\nrequires-python = ">=3.10"\nlicense = { text = "MIT" }\n\n[project.urls]\nRepository = "https://github.com/example/ledger-clean"\n\n[project.scripts]\nledger-clean = "ledger_clean.cli:main"\n`,
      "src/ledger_clean/cli.py": "def main():\n    pass\n",
      "docs/USAGE.md": "```bash\npython -m pip install .\nledger-clean input.csv --out clean.csv\npython -m unittest\n```\n",
      "LICENSE": "MIT License\n",
    },
  },
]

function parseInterface(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString("utf8")
  PublicInterfaceSchema.parse(JSON.parse(text))
  return text
}

function buildTask(fixture: TaskFixture, interfaceText: string): ZhReadmeTaskSet["tasks"][number] {
  const fixtures = { ...fixture.files, "readme-interface.json": interfaceText }
  const protectedSha256 = Object.fromEntries(Object.entries(fixtures)
    .map(([name, text]) => [name, sha256Bytes(Buffer.from(text, "utf8"))]))
  return TaskSchema.parse({
    id: fixture.id,
    split: fixture.split,
    prompt: TASK_PROMPT,
    fixtures,
    successCriteria: [],
    eval: EVALUATORS.map(([id, name, weight, check]) => ({
      method: "custom" as const, id, name, weight, evaluatorId: EVALUATOR_ID,
      payload: {
        schemaVersion: "skill-ir-zh-readme-eval/v1" as const,
        check,
        paths: { interface: "readme-interface.json" as const, readme: "README.zh-CN.md" as const },
        protectedSha256,
      },
    })),
    hardGateIds: EVALUATORS.map(([id]) => id),
    passThreshold: 1,
  })
}

export function buildZhReadmeTaskSet(split: "development" | "heldout", publicInterfaceBytes: Uint8Array): ZhReadmeTaskSet {
  const interfaceText = parseInterface(publicInterfaceBytes)
  const fixtures = split === "development" ? DEVELOPMENT_FIXTURES : HELDOUT_FIXTURES
  return ZhReadmeTaskSetSchema.parse({
    schemaVersion: "skill-ir-tasks/v1", skillId: SKILL_ID,
    tasks: [buildTask(fixtures[0], interfaceText), buildTask(fixtures[1], interfaceText)],
  })
}

function findForbiddenEvidence(value: unknown, pathParts: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (const [index, nested] of value.entries()) {
      const found = findForbiddenEvidence(nested, [...pathParts, String(index)])
      if (found) return found
    }
    return null
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (/^(?:expected|expectedAnswer|gold|goldAnswer|answer|oracle|sourceQuote)$/iu.test(key)) {
        return [...pathParts, key].join(".")
      }
      const found = findForbiddenEvidence(nested, [...pathParts, key])
      if (found) return found
    }
  }
  return null
}

function containsText(value: unknown, pattern: RegExp): boolean {
  if (typeof value === "string") return pattern.test(value)
  if (Array.isArray(value)) return value.some((nested) => containsText(nested, pattern))
  if (value && typeof value === "object") return Object.values(value).some((nested) => containsText(nested, pattern))
  return false
}

export function validateZhReadmeTaskSet(
  input: unknown,
  split: "development" | "heldout",
  publicInterfaceBytes: Uint8Array,
): ZhReadmeTaskSet {
  const forbidden = findForbiddenEvidence(input)
  if (forbidden) throw new Error(`zh-readme task contains forbidden evidence at ${forbidden}`)
  if (split === "development" && containsText(input, /TEST_ONLY_HELDOUT_ZH_README/u)) {
    throw new Error("zh-readme development task contains held-out evidence")
  }
  if (containsText(input, /network access is allowed|install packages and inspect|inspect the live website/iu)) {
    throw new Error("zh-readme task grants forbidden execution permission")
  }
  const parsed = ZhReadmeTaskSetSchema.parse(input)
  if (parsed.tasks.some((task) => task.split !== split)) throw new Error(`task split mismatch: expected ${split}`)
  const expected = buildZhReadmeTaskSet(split, publicInterfaceBytes)
  if (!isDeepStrictEqual(parsed, expected)) throw new Error("zh-readme task set differs from preregistered construction")
  return parsed
}

export async function validateZhReadmeSourceClosure(rootDir: string) {
  const sourceRoot = path.join(rootDir, "benchmarks/skill-ir/pilots/zh-readme/source")
  const skillSha256 = sha256Bytes(await readFile(path.join(sourceRoot, "SKILL.md")))
  const licenseSha256 = sha256Bytes(await readFile(path.join(sourceRoot, "LICENSE.upstream")))
  if (skillSha256 !== SKILL_SHA256) throw new Error("zh-readme source digest mismatch")
  if (licenseSha256 !== LICENSE_SHA256) throw new Error("zh-readme license digest mismatch")
  return {
    commit: UPSTREAM_COMMIT,
    upstreamSkillSha256: UPSTREAM_SKILL_SHA256,
    upstreamLicenseSha256: UPSTREAM_LICENSE_SHA256,
    skillSha256,
    licenseSha256,
    normalization: "none" as const,
  }
}

const FrozenPathSchema = z.object({ path: NonEmptyStringSchema, sha256: Sha256Schema }).strict()

export const ZhReadmeTaskSplitFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-readme-task-split-freeze/v1"),
  skillId: z.literal(SKILL_ID),
  role: z.literal("method-development"),
  frozenDate: z.literal("2026-08-02"),
  source: FrozenPathSchema.extend({
    upstreamCommit: z.literal(UPSTREAM_COMMIT),
    upstreamPath: z.literal("skills/zh-readme/SKILL.md"),
    upstreamSha256: z.literal(UPSTREAM_SKILL_SHA256),
    normalization: z.literal("none"),
  }).strict(),
  license: FrozenPathSchema.extend({
    license: z.literal("MIT"), upstreamSha256: z.literal(UPSTREAM_LICENSE_SHA256),
    normalization: z.literal("crlf-to-lf"),
  }).strict(),
  publicInterface: FrozenPathSchema,
  resourceContract: FrozenPathSchema,
  development: FrozenPathSchema.extend({
    taskIds: z.tuple([z.literal(ZH_README_DEVELOPMENT_TASK_IDS[0]), z.literal(ZH_README_DEVELOPMENT_TASK_IDS[1])]),
  }).strict(),
  heldout: FrozenPathSchema.extend({
    taskIds: z.tuple([z.literal(ZH_README_HELDOUT_TASK_IDS[0]), z.literal(ZH_README_HELDOUT_TASK_IDS[1])]),
  }).strict(),
  isolation: z.object({
    scorerImplementedAfterFreeze: z.literal(true), developmentMayReadHeldoutContent: z.literal(false),
    heldoutMayEnterCalibration: z.literal(false), compilerMayReadEvaluatorPayload: z.literal(false),
  }).strict(),
}).strict()

async function verifyFrozenPath(rootDir: string, record: { path: string; sha256: string }): Promise<void> {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, record.path)
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Frozen path escapes repository root: ${record.path}`)
  }
  if (sha256Bytes(await readFile(absolute)) !== record.sha256) {
    throw new Error(`Frozen path digest mismatch for ${record.path}`)
  }
}

export async function validateZhReadmeTaskSplitFreeze(input: { rootDir: string; freeze: unknown }) {
  const freeze = ZhReadmeTaskSplitFreezeSchema.parse(input.freeze)
  await Promise.all([
    verifyFrozenPath(input.rootDir, freeze.source), verifyFrozenPath(input.rootDir, freeze.license),
    verifyFrozenPath(input.rootDir, freeze.publicInterface), verifyFrozenPath(input.rootDir, freeze.resourceContract),
    verifyFrozenPath(input.rootDir, freeze.development), verifyFrozenPath(input.rootDir, freeze.heldout),
  ])
  return freeze
}
