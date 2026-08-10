import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { customEvaluators } from "../../framework/types.ts"
import { customEvaluatorSourcePaths } from "./index.ts"
import { deriveI18nContributionSourceFacts } from "./i18n-helper-contribution-grade.ts"
import { i18nHelperContributionGrade } from "./i18n-helper-contribution-grade.ts"

const TASK_ROOT = "benchmarks/skill-ir/pilots/i18n-helper/contribution-v1"
const roots: string[] = []
const checks = [
  "delta-policy",
  "artifact-contract",
  "extraction-coverage",
  "literal-preservation",
  "locale-semantics",
] as const

type Task = { fixtures: Record<string, string> }

async function developmentTasks(): Promise<Task[]> {
  const value = JSON.parse(await readFile(`${TASK_ROOT}/development/tasks.json`, "utf8")) as {
    tasks: Array<{ fixtures: Record<string, string> }>
  }
  return value.tasks
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRun(task: Task): Promise<{ workDir: string; result: RunResult }> {
  const root = await mkdtemp(path.join(tmpdir(), "i18n-contribution-"))
  roots.push(root)
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

async function writeCanonicalMultifileOutputs(workDir: string, prefix: string): Promise<void> {
  const keys = {
    greeting: `${prefix}.greeting`,
    panel: `${prefix}.panel`,
    title: `${prefix}.title`,
    save: `${prefix}.save`,
  }
  await mkdir(path.join(workDir, "src", "locales"), { recursive: true })
  await writeFile(
    path.join(workDir, "src", "App.tsx"),
    `import { useTranslation } from 'react-i18next';\nimport { Panel } from './Panel';\n\nexport function App({ name }: { name: string }) {\n  const { t } = useTranslation();\n  console.debug('HTTP');\n  return <main data-testid="app-shell"><h1>{t('${keys.greeting}', { name })}</h1><a href="https://status.example.test">API</a><Panel /></main>;\n}\n`,
    "utf8",
  )
  await writeFile(
    path.join(workDir, "src", "Panel.tsx"),
    `import { useTranslation } from 'react-i18next';\nexport function Panel() {\n  const { t } = useTranslation();\n  return <section aria-label={t('${keys.panel}')}><button title={t('${keys.title}')}>{t('${keys.save}')}</button><button>{t('${keys.save}')}</button></section>;\n}\n`,
    "utf8",
  )
  await writeFile(
    path.join(workDir, "src", "i18n.ts"),
    "import i18n from 'i18next';\nimport { initReactI18next } from 'react-i18next';\nimport zhCN from './locales/zh-CN.json';\nimport enUS from './locales/en-US.json';\ni18n.use(initReactI18next).init({ resources: { 'zh-CN': { translation: zhCN }, 'en-US': { translation: enUS } } });\nexport default i18n;\n",
    "utf8",
  )
  await writeFile(path.join(workDir, "src", "locales", "zh-CN.json"), JSON.stringify({
    [keys.greeting]: "欢迎，{{name}}",
    [keys.panel]: "操作面板",
    [keys.title]: "保存当前草稿",
    [keys.save]: "保存",
  }), "utf8")
  await writeFile(path.join(workDir, "src", "locales", "en-US.json"), JSON.stringify({
    [keys.greeting]: "Welcome, {{name}}",
    [keys.panel]: "Action panel",
    [keys.title]: "Save current draft",
    [keys.save]: "Save",
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

async function writeCanonicalPartialOutputs(workDir: string, prefix: string): Promise<void> {
  const countKey = `${prefix}.count`
  const panelKey = `${prefix}.panel`
  await writeFile(
    path.join(workDir, "src", "App.tsx"),
    `import { useTranslation } from 'react-i18next';\nimport { Panel } from './Panel';\n\nexport function App({ count }: { count: number }) {\n  const { t } = useTranslation();\n  console.info('SDK');\n  return <main data-testid="cart-shell"><h1>{t('common.cart')}</h1><p>{t('${countKey}', { count })}</p><Panel /></main>;\n}\n`,
    "utf8",
  )
  await writeFile(
    path.join(workDir, "src", "Panel.tsx"),
    `import { useTranslation } from 'react-i18next';\n\nexport function Panel() {\n  const { t } = useTranslation();\n  return <aside aria-label={t('${panelKey}')}><button>{t('common.cancel')}</button><a href="https://shop.example.test">HTTP</a></aside>;\n}\n`,
    "utf8",
  )
  await writeFile(path.join(workDir, "src", "locales", "zh-CN.json"), JSON.stringify({
    common: { cart: "购物车", cancel: "取消" },
    [countKey]: "购物车中有 {{count}} 件商品",
    [panelKey]: "购物车操作",
  }), "utf8")
  await writeFile(path.join(workDir, "src", "locales", "en-US.json"), JSON.stringify({
    common: { cart: "Cart", cancel: "Cancel" },
    [countKey]: "The cart has {{count}} items",
    [panelKey]: "Cart actions",
  }), "utf8")
  await writeFile(path.join(workDir, "i18n-report.json"), JSON.stringify({
    framework: "react-i18next",
    scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
    entries: [
      { sourceFile: "src/App.tsx", originalText: "购物车中有 {{count}} 件商品", key: countKey, placeholders: ["count"], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "购物车操作", key: panelKey, placeholders: [], occurrences: 1 },
    ],
    missingKeys: { "zh-CN": [], "en-US": [] },
  }), "utf8")
}

async function grade(check: typeof checks[number], result: RunResult) {
  return i18nHelperContributionGrade.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-i18n-helper-contribution-v1",
      payload: { schemaVersion: "skill-ir-i18n-contribution-eval/v1", check },
    },
    runResult: result,
  })
}

describe("i18n-helper contribution source evidence", () => {
  test("registers the successor evaluator identity", () => {
    expect(customEvaluators.get("skill-ir-i18n-helper-contribution-v1")).toBe(i18nHelperContributionGrade)
    expect(customEvaluatorSourcePaths.get("skill-ir-i18n-helper-contribution-v1")).toBe(
      "src/bench/evaluators/i18n-helper-contribution-grade.ts",
    )
  })

  test("derives user-visible messages, interpolation, repetition, and exclusions from public baselines", async () => {
    const [multifile, partial] = await developmentTasks()
    const first = deriveI18nContributionSourceFacts({
      "src/App.tsx": multifile!.fixtures["baseline/src/App.tsx"]!,
      "src/Panel.tsx": multifile!.fixtures["baseline/src/Panel.tsx"]!,
    })
    const second = deriveI18nContributionSourceFacts({
      "src/App.tsx": partial!.fixtures["baseline/src/App.tsx"]!,
      "src/Panel.tsx": partial!.fixtures["baseline/src/Panel.tsx"]!,
    })

    expect(first.candidates).toHaveLength(4)
    expect(first.candidates).toEqual(expect.arrayContaining([
      { sourceFile: "src/App.tsx", originalText: "欢迎，{{name}}", placeholders: ["name"], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "操作面板", placeholders: [], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "保存当前草稿", placeholders: [], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "保存", placeholders: [], occurrences: 2 },
    ]))
    expect(first.preservedLiterals).toEqual(expect.arrayContaining([
      "./Panel", "HTTP", "app-shell", "https://status.example.test", "API",
    ]))
    expect(second.candidates).toHaveLength(2)
    expect(second.candidates).toEqual(expect.arrayContaining([
      { sourceFile: "src/App.tsx", originalText: "购物车中有 {{count}} 件商品", placeholders: ["count"], occurrences: 1 },
      { sourceFile: "src/Panel.tsx", originalText: "购物车操作", placeholders: [], occurrences: 1 },
    ]))
    expect(second.existingTranslationCalls).toEqual([
      { key: "common.cart", placeholders: [] },
      { key: "common.cancel", placeholders: [] },
    ])
  })

  test("accepts multiple alternative-valid key allocations derived from the same public evidence", async () => {
    const [task] = await developmentTasks()
    for (const prefix of ["screen.alpha", "view.beta"]) {
      const run = await makeRun(task!)
      await writeCanonicalMultifileOutputs(run.workDir, prefix)
      for (const check of checks) {
        expect(await grade(check, run.result)).toMatchObject({ pass: true, score: 1 })
      }
    }
  })

  test("preserves existing translations while accepting source-derived count semantics", async () => {
    const [, task] = await developmentTasks()
    const run = await makeRun(task!)
    await writeCanonicalPartialOutputs(run.workDir, "cart.dynamic")
    for (const check of checks) {
      expect(await grade(check, run.result)).toMatchObject({ pass: true, score: 1 })
    }

    const enPath = path.join(run.workDir, "src", "locales", "en-US.json")
    const en = JSON.parse(await readFile(enPath, "utf8")) as Record<string, unknown>
    ;(en.common as Record<string, string>).cart = "Changed"
    await writeFile(enPath, JSON.stringify(en), "utf8")
    expect(await grade("locale-semantics", run.result)).toMatchObject({ pass: false, score: 0 })
  })

  test("rejects structurally complete outputs that leave public source semantics unresolved", async () => {
    const [task] = await developmentTasks()
    const run = await makeRun(task!)
    await mkdir(path.join(run.workDir, "src", "locales"), { recursive: true })
    await writeFile(path.join(run.workDir, "src", "i18n.ts"), "export default {};\n", "utf8")
    await writeFile(path.join(run.workDir, "src", "locales", "zh-CN.json"), "{}\n", "utf8")
    await writeFile(path.join(run.workDir, "src", "locales", "en-US.json"), "{}\n", "utf8")
    await writeFile(path.join(run.workDir, "i18n-report.json"), JSON.stringify({
      framework: "react-i18next",
      scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
      entries: [],
      missingKeys: { "zh-CN": [], "en-US": [] },
    }), "utf8")

    expect(await grade("delta-policy", run.result)).toMatchObject({ pass: true, score: 1 })
    expect(await grade("artifact-contract", run.result)).toMatchObject({ pass: false, score: 0 })
    expect(await grade("extraction-coverage", run.result)).toMatchObject({ pass: false, score: 0 })
    expect(await grade("locale-semantics", run.result)).toMatchObject({ pass: false, score: 0 })
  })

  test("classifies malformed public reports as semantic failures instead of infrastructure", async () => {
    const [task] = await developmentTasks()
    const run = await makeRun(task!)
    await writeCanonicalMultifileOutputs(run.workDir, "malformed.case")
    await writeFile(path.join(run.workDir, "i18n-report.json"), JSON.stringify({
      framework: "react-i18next",
      scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
      entries: [{}],
      missingKeys: { "zh-CN": [], "en-US": [] },
    }), "utf8")

    for (const check of ["artifact-contract", "extraction-coverage", "locale-semantics"] as const) {
      const result = await grade(check, run.result)
      expect(result).toMatchObject({ pass: false, score: 0 })
      expect(result.infraError).toBeUndefined()
    }
  })
})
