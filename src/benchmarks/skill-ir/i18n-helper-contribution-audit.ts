import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import type { RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { i18nHelperContributionGrade } from "../../bench/evaluators/i18n-helper-contribution-grade.ts"
import { i18nHelperContributionV2Grade } from "../../bench/evaluators/i18n-helper-contribution-v2-grade.ts"

const ROOT = "benchmarks/skill-ir/pilots/i18n-helper/contribution-v1"
const V2_ROOT = "benchmarks/skill-ir/pilots/i18n-helper/contribution-v2"
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

export const I18nContributionV2AuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-i18n-contribution-contract-audit/v2"),
  benchmarkId: z.literal("i18n-helper-contribution-v2"),
  split: z.literal("development"),
  canaries: z.object({
    canonicalValid: z.boolean(),
    alternativeValid: z.boolean(),
    pluralFamilyValid: z.boolean(),
    promptOnlyOmissionAccepted: z.boolean(),
    reverseEvidenceRemovesConstraint: z.boolean(),
    forbiddenSinkFree: z.boolean(),
  }).strict(),
  materialization: z.object({
    taskContractMatchesAuthority: z.boolean(),
    semanticsMatchesAuthority: z.boolean(),
    protectedBaselinesPresent: z.boolean(),
    evaluatorDoesNotReadHeldoutOrGold: z.boolean(),
  }).strict(),
}).strict()

export type I18nContributionV2AuditReport = z.infer<typeof I18nContributionV2AuditReportSchema>

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

async function writeOutputs(workDir: string, prefix: string, reportSyntax: "single" | "double" = "double"): Promise<void> {
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
      { sourceFile: "src/App.tsx", originalText: reportSyntax === "single" ? "欢迎，{name}" : "欢迎，{{name}}", key: keys.greeting, placeholders: ["name"], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "操作面板", key: keys.panel, placeholders: [], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "保存当前草稿", key: keys.title, placeholders: [], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "保存", key: keys.save, placeholders: [], occurrences: 2 },
    ],
    missingKeys: { "zh-CN": [], "en-US": [] },
  }), "utf8")
}

async function writePluralOutputs(workDir: string, prefix: string): Promise<void> {
  const countKey = `${prefix}.count`
  const panelKey = `${prefix}.panel`
  await writeFile(path.join(workDir, "src", "App.tsx"),
    `import { useTranslation } from 'react-i18next';\nimport { Panel } from './Panel';\nexport function App({ count }: { count: number }) { const { t } = useTranslation(); console.info('SDK'); return <main data-testid="cart-shell"><h1>{t('common.cart')}</h1><p>{t('${countKey}', { count })}</p><Panel /></main>; }\n`, "utf8")
  await writeFile(path.join(workDir, "src", "Panel.tsx"),
    `import { useTranslation } from 'react-i18next';\nexport function Panel() { const { t } = useTranslation(); return <aside aria-label={t('${panelKey}')}><button>{t('common.cancel')}</button><a href="https://shop.example.test">HTTP</a></aside>; }\n`, "utf8")
  await writeFile(path.join(workDir, "src", "locales", "zh-CN.json"), JSON.stringify({
    common: { cart: "购物车", cancel: "取消" },
    [prefix]: { count_other: "购物车中有 {{count}} 件商品", panel: "购物车操作" },
  }), "utf8")
  await writeFile(path.join(workDir, "src", "locales", "en-US.json"), JSON.stringify({
    common: { cart: "Cart", cancel: "Cancel" },
    [prefix]: { count_one: "There is {{count}} item", count_other: "There are {{count}} items", panel: "Cart actions" },
  }), "utf8")
  await writeFile(path.join(workDir, "i18n-report.json"), JSON.stringify({
    framework: "react-i18next",
    scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
    entries: [
      { sourceFile: "src/App.tsx", originalText: "购物车中有 {count} 件商品", key: countKey, placeholders: ["count"], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "购物车操作", key: panelKey, placeholders: [], occurrences: 1 },
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

async function allV2ChecksPass(runResult: RunResult): Promise<boolean> {
  for (const check of CHECKS) {
    const result = await i18nHelperContributionV2Grade.run({
      criterion: {
        method: "custom",
        evaluatorId: "skill-ir-i18n-helper-contribution-v2",
        payload: { schemaVersion: "skill-ir-i18n-contribution-eval/v2", check },
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

async function runV2ValidCase(task: Task, prefix: string): Promise<boolean> {
  const run = await materialize(task)
  try {
    await writeOutputs(run.workDir, prefix, "single")
    return await allV2ChecksPass(run.runResult)
  } finally {
    await rm(run.root, { recursive: true, force: true })
  }
}

async function runV2PluralCase(task: Task): Promise<boolean> {
  const run = await materialize(task)
  try {
    await writePluralOutputs(run.workDir, "audit")
    return await allV2ChecksPass(run.runResult)
  } finally {
    await rm(run.root, { recursive: true, force: true })
  }
}

async function runV2OmissionCase(task: Task): Promise<boolean> {
  const run = await materialize(task)
  try {
    await writeOutputs(run.workDir, "audit.omission", "single")
    const sourcePath = path.join(run.workDir, "src", "App.tsx")
    const source = await readFile(sourcePath, "utf8")
    await writeFile(sourcePath, source.replace(
      '<a href="https://status.example.test">API</a>',
      `<a href="https://status.example.test">{t('audit.tech')}</a>`,
    ), "utf8")
    return await allV2ChecksPass(run.runResult)
  } finally {
    await rm(run.root, { recursive: true, force: true })
  }
}

async function runV2ReverseEvidenceCase(task: Task): Promise<boolean> {
  const removed = '<a href="https://status.example.test">API</a>'
  const mutated: Task = { fixtures: { ...task.fixtures } }
  for (const relativePath of ["src/App.tsx", "baseline/src/App.tsx"]) {
    mutated.fixtures[relativePath] = mutated.fixtures[relativePath]!.replace(removed, "")
  }
  const run = await materialize(mutated)
  try {
    await writeOutputs(run.workDir, "audit.reverse", "single")
    const sourcePath = path.join(run.workDir, "src", "App.tsx")
    const source = await readFile(sourcePath, "utf8")
    await writeFile(sourcePath, source.replace(removed, ""), "utf8")
    return await allV2ChecksPass(run.runResult)
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

export async function runI18nContributionV2Audit(input: {
  repositoryRoot: string
  outputPath: string
}): Promise<I18nContributionV2AuditReport> {
  const root = path.resolve(input.repositoryRoot)
  const [contractText, semanticsText, taskText, evaluatorText] = await Promise.all([
    readFile(path.join(root, V2_ROOT, "public-contract.json"), "utf8"),
    readFile(path.join(root, V2_ROOT, "i18n-report-semantics.json"), "utf8"),
    readFile(path.join(root, V2_ROOT, "development", "tasks.json"), "utf8"),
    readFile(path.join(root, "src/bench/evaluators/i18n-helper-contribution-v2-grade.ts"), "utf8"),
  ])
  const contract = JSON.parse(contractText) as { protectedFiles: string[] }
  const taskSet = JSON.parse(taskText) as { tasks: Task[] }
  const [multifile, partial] = taskSet.tasks
  const report = I18nContributionV2AuditReportSchema.parse({
    schemaVersion: "skill-ir-i18n-contribution-contract-audit/v2",
    benchmarkId: "i18n-helper-contribution-v2",
    split: "development",
    canaries: {
      canonicalValid: await runV2ValidCase(multifile!, "audit.canonical"),
      alternativeValid: await runV2ValidCase(multifile!, "other.valid"),
      pluralFamilyValid: await runV2PluralCase(partial!),
      promptOnlyOmissionAccepted: await runV2OmissionCase(multifile!),
      reverseEvidenceRemovesConstraint: await runV2ReverseEvidenceCase(multifile!),
      forbiddenSinkFree: !/heldout\/tasks\.json|expectedAnswer|goldAnswer|raw-runs|TEST_ONLY_/iu.test(evaluatorText),
    },
    materialization: {
      taskContractMatchesAuthority: taskSet.tasks.every((task) =>
        JSON.stringify(JSON.parse(task.fixtures["i18n-contract.json"]!)) === JSON.stringify(JSON.parse(contractText))
      ),
      semanticsMatchesAuthority: taskSet.tasks.every((task) =>
        JSON.stringify(JSON.parse(task.fixtures["i18n-report-semantics.json"]!)) === JSON.stringify(JSON.parse(semanticsText))
      ),
      protectedBaselinesPresent: contract.protectedFiles
        .filter((entry) => entry.startsWith("baseline/"))
        .every((entry) => taskSet.tasks.every((task) => typeof task.fixtures[entry] === "string")),
      evaluatorDoesNotReadHeldoutOrGold: !/heldout\/tasks\.json|expectedAnswer|goldAnswer/iu.test(evaluatorText),
    },
  })
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true })
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  const version = process.argv.includes("--version=v2") ? "v2" : "v1"
  const positional = process.argv.slice(2).find((argument) => !argument.startsWith("--"))
  const outputPath = positional
    ?? `results/skill-ir/i18n-helper-contribution-contract-audit-${version}/report.json`
  const run = version === "v2" ? runI18nContributionV2Audit : runI18nContributionAudit
  console.log(JSON.stringify(await run({
    repositoryRoot: process.cwd(),
    outputPath,
  }), null, 2))
}
