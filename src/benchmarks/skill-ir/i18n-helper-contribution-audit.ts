import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import type { RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { i18nHelperContributionGrade } from "../../bench/evaluators/i18n-helper-contribution-grade.ts"

const ROOT = "benchmarks/skill-ir/pilots/i18n-helper/contribution-v1"
const CHECKS = [
  "delta-policy",
  "artifact-contract",
  "extraction-coverage",
  "literal-preservation",
  "locale-semantics",
] as const

export const I18nContributionAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-i18n-contribution-contract-audit/v1"),
  benchmarkId: z.literal("i18n-helper-contribution-v1"),
  split: z.literal("development"),
  canaries: z.object({
    canonicalValid: z.boolean(),
    alternativeValid: z.boolean(),
    promptOnlyOmissionAccepted: z.boolean(),
    reverseEvidenceRemovesConstraint: z.boolean(),
    forbiddenSinkFree: z.boolean(),
  }).strict(),
  materialization: z.object({
    taskContractMatchesAuthority: z.boolean(),
    protectedBaselinesPresent: z.boolean(),
    evaluatorDoesNotReadHeldoutOrGold: z.boolean(),
  }).strict(),
}).strict()

export type I18nContributionAuditReport = z.infer<typeof I18nContributionAuditReportSchema>

type Task = { fixtures: Record<string, string> }

async function materialize(task: Task): Promise<{ root: string; workDir: string; runResult: RunResult }> {
  const root = await mkdtemp(path.join(tmpdir(), "i18n-contribution-case-"))
  const workDir = path.join(root, "workdir")
  for (const [relativePath, content] of Object.entries(task.fixtures)) {
    const target = path.join(workDir, ...relativePath.split("/"))
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, "utf8")
  }
  const initialWorkdirManifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: path.join(root, "initial-workdir-manifest.json"),
  })
  return {
    root,
    workDir,
    runResult: {
      text: "audit",
      steps: [],
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
      durationMs: 0,
      llmDurationMs: 0,
      workDir,
      runStatus: "ok",
      usageAvailable: true,
      initialWorkdirManifest,
    },
  }
}

async function writeOutputs(workDir: string, prefix: string): Promise<void> {
  const keys = {
    greeting: `${prefix}.greeting`, panel: `${prefix}.panel`, title: `${prefix}.title`, save: `${prefix}.save`,
  }
  await mkdir(path.join(workDir, "src", "locales"), { recursive: true })
  await writeFile(path.join(workDir, "src", "App.tsx"),
    `import { useTranslation } from 'react-i18next';\nimport { Panel } from './Panel';\n\nexport function App({ name }: { name: string }) {\n  const { t } = useTranslation();\n  console.debug('HTTP');\n  return <main data-testid="app-shell"><h1>{t('${keys.greeting}', { name })}</h1><a href="https://status.example.test">API</a><Panel /></main>;\n}\n`, "utf8")
  await writeFile(path.join(workDir, "src", "Panel.tsx"),
    `import { useTranslation } from 'react-i18next';\nexport function Panel() {\n  const { t } = useTranslation();\n  return <section aria-label={t('${keys.panel}')}><button title={t('${keys.title}')}>{t('${keys.save}')}</button><button>{t('${keys.save}')}</button></section>;\n}\n`, "utf8")
  await writeFile(path.join(workDir, "src", "i18n.ts"),
    "import i18n from 'i18next';\nimport { initReactI18next } from 'react-i18next';\nimport zhCN from './locales/zh-CN.json';\nimport enUS from './locales/en-US.json';\ni18n.use(initReactI18next).init({ resources: { 'zh-CN': { translation: zhCN }, 'en-US': { translation: enUS } } });\nexport default i18n;\n", "utf8")
  await writeFile(path.join(workDir, "src", "locales", "zh-CN.json"), JSON.stringify({
    [keys.greeting]: "欢迎，{{name}}", [keys.panel]: "操作面板", [keys.title]: "保存当前草稿", [keys.save]: "保存",
  }), "utf8")
  await writeFile(path.join(workDir, "src", "locales", "en-US.json"), JSON.stringify({
    [keys.greeting]: "Welcome, {{name}}", [keys.panel]: "Action panel", [keys.title]: "Save current draft", [keys.save]: "Save",
  }), "utf8")
  await writeFile(path.join(workDir, "i18n-report.json"), JSON.stringify({
    framework: "react-i18next",
    scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
    entries: [
      { sourceFile: "src/App.tsx", originalText: "欢迎，{{name}}", key: keys.greeting, placeholders: ["name"], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "操作面板", key: keys.panel, placeholders: [], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "保存当前草稿", key: keys.title, placeholders: [], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "保存", key: keys.save, placeholders: [], occurrences: 2 },
    ],
    missingKeys: { "zh-CN": [], "en-US": [] },
  }), "utf8")
}

async function allChecksPass(runResult: RunResult): Promise<boolean> {
  for (const check of CHECKS) {
    const result = await i18nHelperContributionGrade.run({
      criterion: {
        method: "custom",
        evaluatorId: "skill-ir-i18n-helper-contribution-v1",
        payload: { schemaVersion: "skill-ir-i18n-contribution-eval/v1", check },
      },
      runResult,
    })
    if (!result.pass || result.infraError) return false
  }
  return true
}

async function runValidCase(task: Task, prefix: string): Promise<boolean> {
  const run = await materialize(task)
  try {
    await writeOutputs(run.workDir, prefix)
    return await allChecksPass(run.runResult)
  } finally {
    await rm(run.root, { recursive: true, force: true })
  }
}

async function runOmissionCase(task: Task): Promise<boolean> {
  const run = await materialize(task)
  try {
    await writeOutputs(run.workDir, "audit.omission")
    const sourcePath = path.join(run.workDir, "src", "App.tsx")
    const source = await readFile(sourcePath, "utf8")
    await writeFile(sourcePath, source.replace(
      '<a href="https://status.example.test">API</a>',
      `<a href="https://status.example.test">{t('audit.tech')}</a>`,
    ), "utf8")
    return await allChecksPass(run.runResult)
  } finally {
    await rm(run.root, { recursive: true, force: true })
  }
}

async function runReverseEvidenceCase(task: Task): Promise<boolean> {
  const removed = '<a href="https://status.example.test">API</a>'
  const mutated: Task = { fixtures: { ...task.fixtures } }
  for (const relativePath of ["src/App.tsx", "baseline/src/App.tsx"]) {
    mutated.fixtures[relativePath] = mutated.fixtures[relativePath]!.replace(removed, "")
  }
  const run = await materialize(mutated)
  try {
    await writeOutputs(run.workDir, "audit.reverse")
    const sourcePath = path.join(run.workDir, "src", "App.tsx")
    const source = await readFile(sourcePath, "utf8")
    await writeFile(sourcePath, source.replace(removed, ""), "utf8")
    return await allChecksPass(run.runResult)
  } finally {
    await rm(run.root, { recursive: true, force: true })
  }
}

export async function runI18nContributionAudit(input: {
  repositoryRoot: string
  outputPath: string
}): Promise<I18nContributionAuditReport> {
  const root = path.resolve(input.repositoryRoot)
  const [contractText, taskText, evaluatorText] = await Promise.all([
    readFile(path.join(root, ROOT, "public-contract.json"), "utf8"),
    readFile(path.join(root, ROOT, "development", "tasks.json"), "utf8"),
    readFile(path.join(root, "src/bench/evaluators/i18n-helper-contribution-grade.ts"), "utf8"),
  ])
  const contract = JSON.parse(contractText) as { protectedFiles: string[] }
  const taskSet = JSON.parse(taskText) as { tasks: Task[] }
  const task = taskSet.tasks[0]!
  const report = I18nContributionAuditReportSchema.parse({
    schemaVersion: "skill-ir-i18n-contribution-contract-audit/v1",
    benchmarkId: "i18n-helper-contribution-v1",
    split: "development",
    canaries: {
      canonicalValid: await runValidCase(task, "audit.canonical"),
      alternativeValid: await runValidCase(task, "other.valid"),
      promptOnlyOmissionAccepted: await runOmissionCase(task),
      reverseEvidenceRemovesConstraint: await runReverseEvidenceCase(task),
      forbiddenSinkFree: !/heldout\/tasks\.json|expectedAnswer|goldAnswer|raw-runs|TEST_ONLY_/iu.test(evaluatorText),
    },
    materialization: {
      taskContractMatchesAuthority: JSON.stringify(JSON.parse(task.fixtures["i18n-contract.json"]!)) === JSON.stringify(JSON.parse(contractText)),
      protectedBaselinesPresent: contract.protectedFiles
        .filter((entry) => entry.startsWith("baseline/"))
        .every((entry) => typeof task.fixtures[entry] === "string"),
      evaluatorDoesNotReadHeldoutOrGold: !/heldout\/tasks\.json|expectedAnswer|goldAnswer/iu.test(evaluatorText),
    },
  })
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true })
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  const outputPath = process.argv[2]
    ?? "results/skill-ir/i18n-helper-contribution-contract-audit-v1/report.json"
  console.log(JSON.stringify(await runI18nContributionAudit({
    repositoryRoot: process.cwd(),
    outputPath,
  }), null, 2))
}
