import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { customEvaluators } from "../../framework/types.ts"
import { i18nHelperContributionGrade } from "./i18n-helper-contribution-grade.ts"
import { i18nHelperContributionV2Grade } from "./i18n-helper-contribution-v2-grade.ts"
import { customEvaluatorSourcePaths } from "./index.ts"

const TASK_ROOT = "benchmarks/skill-ir/pilots/i18n-helper/contribution-v1"
const roots: string[] = []

type Task = { fixtures: Record<string, string> }

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function developmentTasks(): Promise<Task[]> {
  const value = JSON.parse(await readFile(`${TASK_ROOT}/development/tasks.json`, "utf8")) as {
    tasks: Task[]
  }
  return value.tasks
}

async function makeRun(task: Task): Promise<{ workDir: string; result: RunResult }> {
  const root = await mkdtemp(path.join(tmpdir(), "i18n-contribution-v2-"))
  roots.push(root)
  const workDir = path.join(root, "workdir")
  for (const [relativePath, content] of Object.entries(task.fixtures)) {
    const target = path.join(workDir, ...relativePath.split("/"))
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, "utf8")
  }
  await writeFile(path.join(workDir, "i18n-report-semantics.json"), JSON.stringify({
    schemaVersion: "skill-ir-i18n-report-semantics/v1",
    originalTextPlaceholderSyntax: "single-brace",
    localeInterpolationSyntax: "double-brace",
    pluralKeyPolicy: "i18next-v4",
  }), "utf8")
  const initialWorkdirManifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: path.join(root, "initial-workdir-manifest.json"),
  })
  return {
    workDir,
    result: {
      text: "done",
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

async function gradeV2(check: "extraction-coverage" | "locale-semantics", result: RunResult) {
  return i18nHelperContributionV2Grade.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-i18n-helper-contribution-v2",
      payload: { schemaVersion: "skill-ir-i18n-contribution-eval/v2", check },
    },
    runResult: result,
  })
}

async function gradeV1(check: "extraction-coverage" | "locale-semantics", result: RunResult) {
  return i18nHelperContributionGrade.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-i18n-helper-contribution-v1",
      payload: { schemaVersion: "skill-ir-i18n-contribution-eval/v1", check },
    },
    runResult: result,
  })
}

async function writeMultifileOutputs(workDir: string): Promise<void> {
  await mkdir(path.join(workDir, "src", "locales"), { recursive: true })
  await writeFile(path.join(workDir, "src", "App.tsx"), "import { useTranslation } from 'react-i18next';\nimport { Panel } from './Panel';\nexport function App({ name }: { name: string }) { const { t } = useTranslation(); console.debug('HTTP'); return <main data-testid=\"app-shell\"><h1>{t('view.welcome', { name })}</h1><a href=\"https://status.example.test\">API</a><Panel /></main>; }\n", "utf8")
  await writeFile(path.join(workDir, "src", "Panel.tsx"), "import { useTranslation } from 'react-i18next';\nexport function Panel() { const { t } = useTranslation(); return <section aria-label={t('view.panel')}><button title={t('view.title')}>{t('view.save')}</button><button>{t('view.save')}</button></section>; }\n", "utf8")
  await writeFile(path.join(workDir, "src", "locales", "zh-CN.json"), JSON.stringify({ view: { welcome: "欢迎，{{name}}", panel: "操作面板", title: "保存当前草稿", save: "保存" } }), "utf8")
  await writeFile(path.join(workDir, "src", "locales", "en-US.json"), JSON.stringify({ view: { welcome: "Welcome, {{name}}", panel: "Action panel", title: "Save current draft", save: "Save" } }), "utf8")
  await writeFile(path.join(workDir, "i18n-report.json"), JSON.stringify({
    framework: "react-i18next",
    scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
    entries: [
      { sourceFile: "src/App.tsx", originalText: "欢迎，{name}", key: "view.welcome", placeholders: ["name"], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "操作面板", key: "view.panel", placeholders: [], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "保存当前草稿", key: "view.title", placeholders: [], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "保存", key: "view.save", placeholders: [], occurrences: 2 },
    ],
    missingKeys: { "zh-CN": [], "en-US": [] },
  }), "utf8")
}

async function writePluralOutputs(workDir: string): Promise<void> {
  await writeFile(path.join(workDir, "src", "App.tsx"), "import { useTranslation } from 'react-i18next';\nimport { Panel } from './Panel';\nexport function App({ count }: { count: number }) { const { t } = useTranslation(); console.info('SDK'); return <main data-testid=\"cart-shell\"><h1>{t('common.cart')}</h1><p>{t('cart.items', { count })}</p><Panel /></main>; }\n", "utf8")
  await writeFile(path.join(workDir, "src", "Panel.tsx"), "import { useTranslation } from 'react-i18next';\nexport function Panel() { const { t } = useTranslation(); return <aside aria-label={t('cart.actions')}><button>{t('common.cancel')}</button><a href=\"https://shop.example.test\">HTTP</a></aside>; }\n", "utf8")
  await writeFile(path.join(workDir, "src", "locales", "zh-CN.json"), JSON.stringify({ common: { cart: "购物车", cancel: "取消" }, cart: { items_other: "购物车中有 {{count}} 件商品", actions: "购物车操作" } }), "utf8")
  await writeFile(path.join(workDir, "src", "locales", "en-US.json"), JSON.stringify({ common: { cart: "Cart", cancel: "Cancel" }, cart: { items_one: "There is {{count}} item", items_other: "There are {{count}} items", actions: "Cart actions" } }), "utf8")
  await writeFile(path.join(workDir, "i18n-report.json"), JSON.stringify({
    framework: "react-i18next",
    scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
    entries: [
      { sourceFile: "src/App.tsx", originalText: "购物车中有 {count} 件商品", key: "cart.items", placeholders: ["count"], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "购物车操作", key: "cart.actions", placeholders: [], occurrences: 1 },
    ],
    missingKeys: { "zh-CN": [], "en-US": [] },
  }), "utf8")
}

describe("i18n-helper contribution v2 public semantics", () => {
  test("registers a prospective evaluator without replacing frozen v1", () => {
    expect(customEvaluators.get("skill-ir-i18n-helper-contribution-v1")).toBe(i18nHelperContributionGrade)
    expect(customEvaluators.get("skill-ir-i18n-helper-contribution-v2")).toBe(i18nHelperContributionV2Grade)
    expect(customEvaluatorSourcePaths.get("skill-ir-i18n-helper-contribution-v2")).toBe(
      "src/bench/evaluators/i18n-helper-contribution-v2-grade.ts",
    )
  })

  test("accepts source-style report placeholders without changing frozen v1 behavior", async () => {
    const [task] = await developmentTasks()
    const run = await makeRun(task!)
    await writeMultifileOutputs(run.workDir)

    expect(await gradeV1("extraction-coverage", run.result)).toMatchObject({ pass: false })
    expect(await gradeV2("extraction-coverage", run.result)).toMatchObject({ pass: true, score: 1 })
    expect(await gradeV2("locale-semantics", run.result)).toMatchObject({ pass: true, score: 1 })
  })

  test("accepts an i18next v4 plural family addressed by one public base key", async () => {
    const [, task] = await developmentTasks()
    const run = await makeRun(task!)
    await writePluralOutputs(run.workDir)

    expect(await gradeV1("locale-semantics", run.result)).toMatchObject({ pass: false })
    expect(await gradeV2("extraction-coverage", run.result)).toMatchObject({ pass: true, score: 1 })
    expect(await gradeV2("locale-semantics", run.result)).toMatchObject({ pass: true, score: 1 })
  })

  test("rejects a plural family missing the English other form", async () => {
    const [, task] = await developmentTasks()
    const run = await makeRun(task!)
    await writePluralOutputs(run.workDir)
    const localePath = path.join(run.workDir, "src", "locales", "en-US.json")
    const locale = JSON.parse(await readFile(localePath, "utf8")) as { cart: Record<string, string> }
    delete locale.cart.items_other
    await writeFile(localePath, JSON.stringify(locale), "utf8")

    expect(await gradeV2("locale-semantics", run.result)).toMatchObject({ pass: false, score: 0 })
  })

  test("requires the public semantics descriptor", async () => {
    const [task] = await developmentTasks()
    const run = await makeRun(task!)
    await writeMultifileOutputs(run.workDir)
    await rm(path.join(run.workDir, "i18n-report-semantics.json"))

    expect(await gradeV2("extraction-coverage", run.result)).toMatchObject({ pass: false, score: 0 })
  })
})
