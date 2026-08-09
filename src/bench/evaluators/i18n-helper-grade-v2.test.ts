import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { customEvaluators } from "../../framework/types.ts"
import { i18nHelperGradeV2 } from "./i18n-helper-grade-v2.ts"

const roots: string[] = []
const schemaVersion = "skill-ir-i18n-helper-eval/v2"
const contract = `${JSON.stringify({
  schemaVersion: "skill-ir-i18n-helper-public-contract/v2",
  contractId: "i18n-helper-react-i18next-v2",
  framework: "react-i18next",
  allowedModifiedFiles: ["src/App.tsx"],
  requiredNewFiles: [
    "src/i18n.ts",
    "src/locales/zh-CN.json",
    "src/locales/en-US.json",
    "i18n-report.json",
  ],
  protectedFiles: ["package.json", "tsconfig.json", "i18n-contract.json"],
  report: {
    path: "i18n-report.json",
    requiredFields: ["framework", "scannedFiles", "extractedKeys", "missingKeys"],
  },
  outputAbi: {
    schemaVersion: "skill-ir-public-output-abi/v1",
    additionalProperties: false,
    fields: {
      framework: { required: true, schema: { type: "string", nullable: false, enum: ["react-i18next"] } },
      scannedFiles: {
        required: true,
        schema: { type: "array", nullable: false, uniqueItems: true, items: { type: "string", nullable: false } },
      },
      extractedKeys: {
        required: true,
        schema: { type: "array", nullable: false, uniqueItems: true, items: { type: "string", nullable: false } },
      },
      missingKeys: {
        required: true,
        schema: {
          type: "object",
          nullable: false,
          additionalProperties: false,
          fields: {
            "zh-CN": {
              required: true,
              schema: { type: "array", nullable: false, uniqueItems: true, items: { type: "string", nullable: false } },
            },
            "en-US": {
              required: true,
              schema: { type: "array", nullable: false, uniqueItems: true, items: { type: "string", nullable: false } },
            },
          },
        },
      },
    },
  },
}, null, 2)}\n`

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRun(source: string): Promise<{ workDir: string; result: RunResult }> {
  const root = await mkdtemp(path.join(tmpdir(), "i18n-helper-grade-"))
  roots.push(root)
  const workDir = path.join(root, "workdir")
  await mkdir(path.join(workDir, "src"), { recursive: true })
  await writeFile(path.join(workDir, "package.json"), "{}\n", "utf8")
  await writeFile(path.join(workDir, "tsconfig.json"), "{}\n", "utf8")
  await writeFile(path.join(workDir, "i18n-contract.json"), contract, "utf8")
  await writeFile(path.join(workDir, "src", "App.tsx"), source, "utf8")
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

async function writeOutputs(input: {
  workDir: string
  source: string
  zh: Record<string, unknown>
  en: Record<string, unknown>
  report: object
}) {
  await mkdir(path.join(input.workDir, "src", "locales"), { recursive: true })
  await writeFile(path.join(input.workDir, "src", "App.tsx"), input.source, "utf8")
  await writeFile(
    path.join(input.workDir, "src", "i18n.ts"),
    "import i18n from 'i18next';\nimport { initReactI18next } from 'react-i18next';\nimport zhCN from './locales/zh-CN.json';\nimport enUS from './locales/en-US.json';\ni18n.use(initReactI18next).init({ resources: { 'zh-CN': { translation: zhCN }, 'en-US': { translation: enUS } } });\nexport default i18n;\n",
    "utf8",
  )
  await writeFile(path.join(input.workDir, "src", "locales", "zh-CN.json"), JSON.stringify(input.zh), "utf8")
  await writeFile(path.join(input.workDir, "src", "locales", "en-US.json"), JSON.stringify(input.en), "utf8")
  await writeFile(path.join(input.workDir, "i18n-report.json"), JSON.stringify(input.report), "utf8")
}

async function grade(check: string, result: RunResult) {
  return i18nHelperGradeV2.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-i18n-helper-v2",
      payload: { schemaVersion, check },
    },
    runResult: result,
  })
}

describe("i18n-helper v2 public semantic evaluator", () => {
  test("registers the evaluator identity", () => {
    expect(customEvaluators.get("skill-ir-i18n-helper-v2")).toBe(i18nHelperGradeV2)
  })

  test("accepts stable marker-derived keys without depending on exact translations", async () => {
    const run = await makeRun("export function App() { return <h1 data-i18n-key=\"home.welcome\">欢迎</h1>; }\n")
    await writeOutputs({
      workDir: run.workDir,
      source: "import { useTranslation } from 'react-i18next';\nexport function App() { const { t } = useTranslation(); return <h1 data-i18n-key=\"home.welcome\">{t('home.welcome')}</h1>; }\n",
      zh: { home: { welcome: "欢迎使用" } },
      en: { home: { welcome: "Welcome" } },
      report: {
        framework: "react-i18next",
        scannedFiles: ["src/App.tsx"],
        extractedKeys: ["home.welcome"],
        missingKeys: { "zh-CN": [], "en-US": [] },
      },
    })

    for (const check of ["delta-policy", "source-transform", "locale-integrity", "interpolation", "report"]) {
      expect(await grade(check, run.result)).toMatchObject({ pass: true, score: 1 })
    }
  })

  test("accepts marker-derived interpolation when locale placeholders and t arguments agree", async () => {
    const run = await makeRun("export function App({ name }: { name: string }) { return <p data-i18n-key=\"profile.greeting\">你好，{name}</p>; }\n")
    await writeOutputs({
      workDir: run.workDir,
      source: "import { useTranslation } from 'react-i18next';\nexport function App({ name }: { name: string }) { const { t } = useTranslation(); return <p data-i18n-key=\"profile.greeting\">{t('profile.greeting', { name })}</p>; }\n",
      zh: { "profile.greeting": "你好，{{name}}" },
      en: { "profile.greeting": "Hello, {{name}}" },
      report: {
        framework: "react-i18next",
        scannedFiles: ["src/App.tsx"],
        extractedKeys: ["profile.greeting"],
        missingKeys: { "zh-CN": [], "en-US": [] },
      },
    })

    for (const check of ["source-transform", "locale-integrity", "interpolation", "report"]) {
      expect(await grade(check, run.result)).toMatchObject({ pass: true, score: 1 })
    }
  })

  test("rejects the predecessor array report shape under the public ABI", async () => {
    const run = await makeRun("export function App() { return <h1 data-i18n-key=\"home.welcome\">欢迎</h1>; }\n")
    await writeOutputs({
      workDir: run.workDir,
      source: "import { useTranslation } from 'react-i18next';\nexport function App() { const { t } = useTranslation(); return <h1 data-i18n-key=\"home.welcome\">{t('home.welcome')}</h1>; }\n",
      zh: { home: { welcome: "欢迎" } },
      en: { home: { welcome: "Welcome" } },
      report: {
        framework: "react-i18next",
        scannedFiles: ["src/App.tsx"],
        extractedKeys: ["home.welcome"],
        missingKeys: [],
      },
    })
    expect(await grade("report", run.result)).toMatchObject({ pass: false, score: 0 })
  })

  test("rejects an i18n setup that only contains expected words but is not valid TypeScript", async () => {
    const run = await makeRun("export function App() { return <h1 data-i18n-key=\"home.welcome\">欢迎</h1>; }\n")
    await writeOutputs({
      workDir: run.workDir,
      source: "import { useTranslation } from 'react-i18next';\nexport function App() { const { t } = useTranslation(); return <h1 data-i18n-key=\"home.welcome\">{t('home.welcome')}</h1>; }\n",
      zh: { "home.welcome": "欢迎" },
      en: { "home.welcome": "Welcome" },
      report: {
        framework: "react-i18next",
        scannedFiles: ["src/App.tsx"],
        extractedKeys: ["home.welcome"],
        missingKeys: { "zh-CN": [], "en-US": [] },
      },
    })
    await writeFile(
      path.join(run.workDir, "src", "i18n.ts"),
      "const broken = 'i18next react-i18next ./locales/zh-CN.json ./locales/en-US.json .init(' !!!\n",
      "utf8",
    )

    expect(await grade("source-transform", run.result)).toMatchObject({ pass: false, score: 0 })
  })

  test("rejects undeclared delta, residual text, incomplete locales, interpolation drift, and false report", async () => {
    const run = await makeRun("export function App({ name }: { name: string }) { return <p data-i18n-key=\"profile.greeting\">你好，{name}</p>; }\n")
    await writeOutputs({
      workDir: run.workDir,
      source: "import { useTranslation } from 'react-i18next';\nexport function App({ name }: { name: string }) { const { t } = useTranslation(); return <p data-i18n-key=\"profile.greeting\">你好，{t('wrong.key', { user: name })}</p>; }\n",
      zh: { "profile.greeting": "你好，{{name}}" },
      en: { "wrong.key": "Hello, {{user}}" },
      report: {
        framework: "react-i18next",
        scannedFiles: [],
        extractedKeys: ["wrong.key"],
        missingKeys: { "zh-CN": [], "en-US": [] },
      },
    })
    await writeFile(path.join(run.workDir, "package.json"), "{\"changed\":true}\n", "utf8")
    await writeFile(path.join(run.workDir, "debug.log"), "extra\n", "utf8")

    for (const check of ["delta-policy", "source-transform", "locale-integrity", "interpolation", "report"]) {
      const result = await grade(check, run.result)
      expect(result.pass).toBe(false)
      expect(result.infraError).toBeUndefined()
    }
  })
})
