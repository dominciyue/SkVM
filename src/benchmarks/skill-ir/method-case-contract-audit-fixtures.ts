import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  hashAuditFixtureDirectory,
  type BenchmarkContractAuditManifest,
} from "./benchmark-contract-audit.ts"
import { sha256Bytes } from "./source-fixture.ts"

type Task = { id: string; fixtures: Record<string, string> }
type TaskSet = { tasks: Task[] }
type Files = Record<string, string>
type Canary = BenchmarkContractAuditManifest["canaries"][number]

type AuditCase = {
  auditId: string
  skillId: string
  root: string
  taskPath: string
  contractPath: string
  sourceAuditPath: string
  scorerPath: string
  evaluatorId: string
  criteria: Array<{ id: string; quote: string; anchor: string }>
  makeVariants(task: Task): { canonical: Files; alternative: Files; invalid: Files }
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function writeFixture(rootDir: string, relativeRoot: string, files: Files): Promise<void> {
  const targetRoot = path.join(rootDir, ...relativeRoot.split("/"))
  await rm(targetRoot, { recursive: true, force: true })
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(targetRoot, ...relativePath.split("/"))
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, "utf8")
  }
}

function lawMarkdown(document: string): string {
  const lines = document.trimEnd().split(/\r\n?|\n/u)
  const output: string[] = []
  for (const [index, line] of lines.entries()) {
    if (index === 0) output.push(`# ${line}`)
    else if (/^第[〇零一二三四五六七八九十百千万两0-9]+(?:编|分编)/u.test(line)) output.push(`## ${line}`)
    else if (/^第[〇零一二三四五六七八九十百千万两0-9]+章/u.test(line)) output.push(`### ${line}`)
    else if (/^第[〇零一二三四五六七八九十百千万两0-9]+节/u.test(line)) output.push(`#### ${line}`)
    else if (/^第[〇零一二三四五六七八九十百千万两0-9]+条/u.test(line)) output.push(`##### ${line}`)
    else {
      const items = [...line.matchAll(/（[一二三四五六七八九十]+）[^（\r\n]+?(?=（[一二三四五六七八九十]+）|$)/gu)]
        .map((match) => match[0].trim())
      output.push(...(items.length > 1 ? items : [line]))
    }
  }
  return `${output.join("\n")}\n`
}

function lawReport(documentClass: "law" | "non-law", alternative: boolean): string {
  const prose = alternative
    ? "本次核验依据公开合同完成，正文表达采用另一种合法措辞。"
    : "公开规则核验完成。"
  return `${prose}\n\n\`\`\`json law-review-evidence\n${JSON.stringify({
    inputPath: "document.txt",
    documentClass,
    deliverable: documentClass === "law",
  })}\n\`\`\`\n`
}

function makeLawVariants(task: Task) {
  const document = task.fixtures["document.txt"]!
  const documentClass = /^(?:GB[\/／]|ISO\b|IEC\b)/iu.test(document.trimStart()) ? "non-law" : "law"
  const base = { ...task.fixtures }
  const canonical: Files = {
    ...base,
    "markdown/document/document+审核报告.md": lawReport(documentClass, false),
  }
  const alternative: Files = {
    ...base,
    "markdown/document/document+审核报告.md": lawReport(documentClass, true),
  }
  if (documentClass === "law") {
    canonical["markdown/document/document+最终成果.md"] = lawMarkdown(document)
    alternative["markdown/document/document+最终成果.md"] = lawMarkdown(document)
  }
  const invalid: Files = {
    ...base,
    "document.txt": `${document}附加改动\n`,
    "debug.log": "undeclared output\n",
    "markdown/document/document+审核报告.md": "```json law-review-evidence\n{\"inputPath\":\"wrong.txt\",\"documentClass\":\"non-law\",\"deliverable\":false}\n```\n",
  }
  if (documentClass === "non-law") {
    invalid["markdown/document/document+最终成果.md"] = "# 不应生成\n"
  }
  return { canonical, alternative, invalid }
}

function lawReportV3(
  documentClass: "law" | "non-law",
  alternative: boolean,
  deliverablePath: unknown = documentClass === "law"
    ? "markdown/document/document+最终成果.md"
    : null,
): string {
  const prose = alternative
    ? "本次核验依据公开合同完成，正文表达采用另一种合法措辞。"
    : "公开规则核验完成。"
  return `${prose}\n\n\`\`\`json law-review-evidence\n${JSON.stringify({
    inputPath: "document.txt",
    documentClass,
    deliverablePath,
  })}\n\`\`\`\n`
}

function makeLawV3Variants(task: Task) {
  const document = task.fixtures["document.txt"]!
  const documentClass = /^(?:GB[\/／]|ISO\b|IEC\b)/iu.test(document.trimStart()) ? "non-law" : "law"
  const base = { ...task.fixtures }
  const canonical: Files = {
    ...base,
    "markdown/document/document+审核报告.md": lawReportV3(documentClass, false),
  }
  const alternative: Files = {
    ...base,
    "markdown/document/document+审核报告.md": lawReportV3(documentClass, true),
  }
  if (documentClass === "law") {
    canonical["markdown/document/document+最终成果.md"] = lawMarkdown(document)
    alternative["markdown/document/document+最终成果.md"] = lawMarkdown(document)
  }
  const invalid: Files = {
    ...base,
    "document.txt": `${document}附加改动\n`,
    "debug.log": "undeclared output\n",
    "markdown/document/document+审核报告.md": lawReportV3(
      documentClass === "law" ? "non-law" : "law",
      false,
      documentClass === "law" ? false : true,
    ),
  }
  if (documentClass === "non-law") invalid["markdown/document/document+最终成果.md"] = "# 不应生成\n"
  return { canonical, alternative, invalid }
}

const i18nSetup = [
  "import i18n from 'i18next';",
  "import { initReactI18next } from 'react-i18next';",
  "import zhCN from './locales/zh-CN.json';",
  "import enUS from './locales/en-US.json';",
  "i18n.use(initReactI18next).init({ resources: { 'zh-CN': { translation: zhCN }, 'en-US': { translation: enUS } } });",
  "export default i18n;",
  "",
].join("\n")

function i18nFiles(
  task: Task,
  source: string,
  zh: Record<string, unknown>,
  en: Record<string, unknown>,
  keys: string[],
): Files {
  return {
    ...task.fixtures,
    "src/App.tsx": source,
    "src/i18n.ts": i18nSetup,
    "src/locales/zh-CN.json": json(zh),
    "src/locales/en-US.json": json(en),
    "i18n-report.json": json({
      framework: "react-i18next",
      scannedFiles: ["src/App.tsx"],
      extractedKeys: keys,
      missingKeys: [],
    }),
  }
}

function makeI18nVariants(task: Task) {
  const isInterpolation = task.id.includes("interpolation")
  if (!isInterpolation) {
    const source = "import { useTranslation } from 'react-i18next';\nexport function App() { const { t } = useTranslation(); console.debug('HTTP'); return <main><h1 data-i18n-key=\"home.welcome\">{t('home.welcome')}</h1><button data-i18n-key=\"home.save\">{t('home.save')}</button></main>; }\n"
    const keys = ["home.save", "home.welcome"]
    const canonical = i18nFiles(task, source, { home: { save: "保存", welcome: "欢迎使用" } }, { home: { save: "Save", welcome: "Welcome" } }, keys)
    const alternative = i18nFiles(task, source, { "home.save": "保存操作", "home.welcome": "欢迎回来" }, { "home.save": "Save now", "home.welcome": "Hello" }, keys)
    return { canonical, alternative, invalid: invalidI18nFiles(task, "home.welcome") }
  }
  const source = "import { useTranslation } from 'react-i18next';\nexport function App({ name }: { name: string }) { const { t } = useTranslation(); return <section><p data-i18n-key=\"profile.greeting\">{t('profile.greeting', { name })}</p><a href=\"https://example.test\">API</a><button data-i18n-key=\"profile.logout\">{t('profile.logout')}</button></section>; }\n"
  const keys = ["profile.greeting", "profile.logout"]
  const canonical = i18nFiles(task, source, { profile: { greeting: "你好，{{name}}", logout: "退出登录" } }, { profile: { greeting: "Hello, {{name}}", logout: "Log out" } }, keys)
  const alternative = i18nFiles(task, source, { "profile.greeting": "{{name}}，你好", "profile.logout": "退出" }, { "profile.greeting": "Welcome {{name}}", "profile.logout": "Sign out" }, keys)
  return { canonical, alternative, invalid: invalidI18nFiles(task, "profile.greeting") }
}

function i18nFilesV2(
  task: Task,
  source: string,
  zh: Record<string, unknown>,
  en: Record<string, unknown>,
  keys: string[],
  missingKeys: unknown = { "zh-CN": [], "en-US": [] },
): Files {
  return {
    ...task.fixtures,
    "src/App.tsx": source,
    "src/i18n.ts": i18nSetup,
    "src/locales/zh-CN.json": json(zh),
    "src/locales/en-US.json": json(en),
    "i18n-report.json": json({
      framework: "react-i18next",
      scannedFiles: ["src/App.tsx"],
      extractedKeys: keys,
      missingKeys,
    }),
  }
}

function makeI18nV2Variants(task: Task) {
  const isInterpolation = task.id.includes("interpolation")
  if (!isInterpolation) {
    const source = "import { useTranslation } from 'react-i18next';\nexport function App() { const { t } = useTranslation(); console.debug('HTTP'); return <main><h1 data-i18n-key=\"home.welcome\">{t('home.welcome')}</h1><button data-i18n-key=\"home.save\">{t('home.save')}</button></main>; }\n"
    const keys = ["home.save", "home.welcome"]
    const canonical = i18nFilesV2(task, source, { home: { save: "保存", welcome: "欢迎使用" } }, { home: { save: "Save", welcome: "Welcome" } }, keys)
    const alternative = i18nFilesV2(task, source, { "home.save": "保存操作", "home.welcome": "欢迎回来" }, { "home.save": "Save now", "home.welcome": "Hello" }, keys)
    const invalid = invalidI18nFiles(task, "home.welcome")
    return { canonical, alternative, invalid }
  }
  const source = "import { useTranslation } from 'react-i18next';\nexport function App({ name }: { name: string }) { const { t } = useTranslation(); return <section><p data-i18n-key=\"profile.greeting\">{t('profile.greeting', { name })}</p><a href=\"https://example.test\">API</a><button data-i18n-key=\"profile.logout\">{t('profile.logout')}</button></section>; }\n"
  const keys = ["profile.greeting", "profile.logout"]
  const canonical = i18nFilesV2(task, source, { profile: { greeting: "你好，{{name}}", logout: "退出登录" } }, { profile: { greeting: "Hello, {{name}}", logout: "Log out" } }, keys)
  const alternative = i18nFilesV2(task, source, { "profile.greeting": "{{name}}，你好", "profile.logout": "退出" }, { "profile.greeting": "Welcome {{name}}", "profile.logout": "Sign out" }, keys)
  const invalid = invalidI18nFiles(task, "profile.greeting")
  return { canonical, alternative, invalid }
}

function makeI18nV3Variants(task: Task) {
  const variants = makeI18nV2Variants(task)
  const alternativeReport = JSON.parse(variants.alternative["i18n-report.json"]!) as {
    extractedKeys: string[]
  }
  alternativeReport.extractedKeys.reverse()
  variants.alternative["i18n-report.json"] = json(alternativeReport)
  return variants
}

function invalidI18nFiles(task: Task, markerKey: string): Files {
  return {
    ...task.fixtures,
    "package.json": "{\"changed\":true}\n",
    "src/App.tsx": `import { useTranslation } from 'react-i18next';\nexport function App() { const { t } = useTranslation(); return <p data-i18n-key="${markerKey}">残留文本 {t('wrong.key', { user: value })}</p>; }\n`,
    "src/i18n.ts": i18nSetup,
    "src/locales/zh-CN.json": json({ [markerKey]: "你好，{{name}}" }),
    "src/locales/en-US.json": json({ "wrong.key": "Hello, {{user}}" }),
    "i18n-report.json": json({ framework: "react-i18next", scannedFiles: [], extractedKeys: ["wrong.key"], missingKeys: [] }),
    "debug.log": "undeclared output\n",
  }
}

const CASES: AuditCase[] = [
  {
    auditId: "law-to-markdown-v2-benchmark-contract-v1",
    skillId: "law-to-markdown-v2",
    root: "benchmarks/skill-ir/pilots/law-to-markdown/v2",
    taskPath: "benchmarks/skill-ir/pilots/law-to-markdown/v2/development/tasks.json",
    contractPath: "benchmarks/skill-ir/pilots/law-to-markdown/v2/public-contract.json",
    sourceAuditPath: "benchmarks/skill-ir/pilots/law-to-markdown/v2/public-contract-source-audit.json",
    scorerPath: "src/bench/evaluators/law-to-markdown-grade-v2.ts",
    evaluatorId: "skill-ir-law-to-markdown-v2",
    criteria: [
      { id: "law-v2-input-and-delta", quote: "exactOutputSet", anchor: "checkInputAndDelta" },
      { id: "law-v2-classification", quote: "classification", anchor: "checkClassification" },
      { id: "law-v2-fidelity", quote: "preserves the source character stream", anchor: "checkContentFidelity" },
      { id: "law-v2-structure", quote: "headingRules", anchor: "checkStructure" },
      { id: "law-v2-review", quote: "reviewEvidence", anchor: "checkReviewEvidence" },
    ],
    makeVariants: makeLawVariants,
  },
  {
    auditId: "i18n-helper-benchmark-contract-v1",
    skillId: "i18n-helper",
    root: "benchmarks/skill-ir/pilots/i18n-helper",
    taskPath: "benchmarks/skill-ir/pilots/i18n-helper/development/tasks.json",
    contractPath: "benchmarks/skill-ir/pilots/i18n-helper/public-contract.json",
    sourceAuditPath: "benchmarks/skill-ir/pilots/i18n-helper/public-contract-source-audit.json",
    scorerPath: "src/bench/evaluators/i18n-helper-grade.ts",
    evaluatorId: "skill-ir-i18n-helper",
    criteria: [
      { id: "i18n-delta", quote: "allowedModifiedFiles", anchor: "checkDelta" },
      { id: "i18n-source-transform", quote: "keyRule", anchor: "checkSource" },
      { id: "i18n-locales", quote: "requiredNewFiles", anchor: "checkLocales" },
      { id: "i18n-interpolation", quote: "interpolationRule", anchor: "checkInterpolation" },
      { id: "i18n-report", quote: "requiredFields", anchor: "checkReport" },
    ],
    makeVariants: makeI18nVariants,
  },
  {
    auditId: "law-to-markdown-v3-public-output-abi-v1",
    skillId: "law-to-markdown-v3",
    root: "benchmarks/skill-ir/pilots/law-to-markdown/v3",
    taskPath: "benchmarks/skill-ir/pilots/law-to-markdown/v3/development/tasks.json",
    contractPath: "benchmarks/skill-ir/pilots/law-to-markdown/v3/public-contract.json",
    sourceAuditPath: "benchmarks/skill-ir/pilots/law-to-markdown/v3/public-contract-source-audit.json",
    scorerPath: "src/bench/evaluators/law-to-markdown-grade-v3.ts",
    evaluatorId: "skill-ir-law-to-markdown-v3",
    criteria: [
      { id: "law-v3-input-and-delta", quote: "exactOutputSet", anchor: "checkInputAndDelta" },
      { id: "law-v3-classification", quote: "classification", anchor: "checkClassification" },
      { id: "law-v3-fidelity", quote: "preserves the source character stream", anchor: "checkContentFidelity" },
      { id: "law-v3-structure", quote: "headingRules", anchor: "checkStructure" },
      { id: "law-v3-review", quote: "outputAbi", anchor: "validatePublicOutputRecord" },
    ],
    makeVariants: makeLawV3Variants,
  },
  {
    auditId: "i18n-helper-v2-public-output-abi-v1",
    skillId: "i18n-helper-v2",
    root: "benchmarks/skill-ir/pilots/i18n-helper/v2",
    taskPath: "benchmarks/skill-ir/pilots/i18n-helper/v2/development/tasks.json",
    contractPath: "benchmarks/skill-ir/pilots/i18n-helper/v2/public-contract.json",
    sourceAuditPath: "benchmarks/skill-ir/pilots/i18n-helper/v2/public-contract-source-audit.json",
    scorerPath: "src/bench/evaluators/i18n-helper-grade-v2.ts",
    evaluatorId: "skill-ir-i18n-helper-v2",
    criteria: [
      { id: "i18n-v2-delta", quote: "allowedModifiedFiles", anchor: "checkDelta" },
      { id: "i18n-v2-source-transform", quote: "keyRule", anchor: "checkSource" },
      { id: "i18n-v2-locales", quote: "requiredNewFiles", anchor: "checkLocales" },
      { id: "i18n-v2-interpolation", quote: "interpolationRule", anchor: "checkInterpolation" },
      { id: "i18n-v2-report", quote: "outputAbi", anchor: "validatePublicOutputRecord" },
    ],
    makeVariants: makeI18nV2Variants,
  },
  {
    auditId: "i18n-helper-v3-public-output-abi-v2",
    skillId: "i18n-helper-v3",
    root: "benchmarks/skill-ir/pilots/i18n-helper/v3",
    taskPath: "benchmarks/skill-ir/pilots/i18n-helper/v3/development/tasks.json",
    contractPath: "benchmarks/skill-ir/pilots/i18n-helper/v3/public-contract.json",
    sourceAuditPath: "benchmarks/skill-ir/pilots/i18n-helper/v3/public-contract-source-audit.json",
    scorerPath: "src/bench/evaluators/i18n-helper-grade-v3.ts",
    evaluatorId: "skill-ir-i18n-helper-v3",
    criteria: [
      { id: "i18n-v2-delta", quote: "allowedModifiedFiles", anchor: "checkDelta" },
      { id: "i18n-v2-source-transform", quote: "keyRule", anchor: "checkSource" },
      { id: "i18n-v2-locales", quote: "requiredNewFiles", anchor: "checkLocales" },
      { id: "i18n-v2-interpolation", quote: "interpolationRule", anchor: "checkInterpolation" },
      { id: "i18n-v2-report", quote: "outputAbi", anchor: "publicOutputRecordsEquivalent" },
    ],
    makeVariants: makeI18nV3Variants,
  },
]

async function generateCase(rootDir: string, auditCase: AuditCase): Promise<BenchmarkContractAuditManifest> {
  const [taskBytes, contractBytes, sourceAuditBytes, scorerBytes] = await Promise.all([
    readFile(path.join(rootDir, ...auditCase.taskPath.split("/"))),
    readFile(path.join(rootDir, ...auditCase.contractPath.split("/"))),
    readFile(path.join(rootDir, ...auditCase.sourceAuditPath.split("/"))),
    readFile(path.join(rootDir, ...auditCase.scorerPath.split("/"))),
  ])
  const taskSet = JSON.parse(taskBytes.toString("utf8")) as TaskSet
  const canaries: Canary[] = []

  for (const task of taskSet.tasks) {
    const variants = auditCase.makeVariants(task)
    const initialRoot = `${auditCase.root}/audit-initial-fixtures/${task.id}`
    await writeFixture(rootDir, initialRoot, task.fixtures)
    const initialDigest = await hashAuditFixtureDirectory(path.join(rootDir, ...initialRoot.split("/")), rootDir)
    const variantDigests = new Map<string, string>()
    for (const [role, files] of Object.entries(variants)) {
      const fixtureRoot = `${auditCase.root}/audit-fixtures/${task.id}/${role}`
      await writeFixture(rootDir, fixtureRoot, files)
      variantDigests.set(role, await hashAuditFixtureDirectory(path.join(rootDir, ...fixtureRoot.split("/")), rootDir))
    }
    for (const criterion of auditCase.criteria) {
      for (const [role, expectedPass] of [["canonical", true], ["alternative", true], ["invalid", false]] as const) {
        canaries.push({
          id: `${criterion.id}-${task.id}-${role}`,
          taskId: task.id,
          criterionId: criterion.id,
          role: role === "canonical" ? "canonical-valid" : role === "alternative" ? "alternative-valid" : "invalid-control",
          fixturePath: `${auditCase.root}/audit-fixtures/${task.id}/${role}`,
          fixtureSha256: variantDigests.get(role)!,
          initialFixturePath: initialRoot,
          initialFixtureSha256: initialDigest,
          expectedPass,
        })
      }
    }
  }

  const taskIds = taskSet.tasks.map((task) => task.id)
  const criteria = auditCase.criteria.map((criterion) => ({
    id: criterion.id,
    hardGate: true,
    taskIds,
    requirementIds: [`${criterion.id}-safety`, `${criterion.id}-equivalence`],
  }))
  const requirements = auditCase.criteria.flatMap((criterion) => {
    const criterionCanaries = canaries.filter((canary) => canary.criterionId === criterion.id)
    const evidence = [{ kind: "skill-source" as const, path: auditCase.contractPath, quote: criterion.quote }]
    return [{
      id: `${criterion.id}-safety`,
      class: "semantic-invariant" as const,
      equivalence: "safety-invariant" as const,
      criterionIds: [criterion.id],
      contractTokens: [criterion.quote],
      scorerAnchors: [{ quote: criterion.anchor }],
      publicEvidence: evidence,
      canaryIds: criterionCanaries.filter((canary) => canary.role !== "alternative-valid").map((canary) => canary.id),
    }, {
      id: `${criterion.id}-equivalence`,
      class: "semantic-invariant" as const,
      equivalence: "semantic-equivalence" as const,
      criterionIds: [criterion.id],
      contractTokens: [criterion.quote],
      scorerAnchors: [{ quote: criterion.anchor }],
      publicEvidence: evidence,
      canaryIds: criterionCanaries.filter((canary) => canary.role === "alternative-valid").map((canary) => canary.id),
    }]
  })
  const manifest: BenchmarkContractAuditManifest = {
    schemaVersion: "skill-ir-benchmark-contract-audit/v1",
    auditId: auditCase.auditId,
    skillId: auditCase.skillId,
    tasks: { path: auditCase.taskPath, sha256: sha256Bytes(taskBytes) },
    scorer: { path: auditCase.scorerPath, sha256: sha256Bytes(scorerBytes), evaluatorId: auditCase.evaluatorId },
    sources: [
      { path: auditCase.contractPath, sha256: sha256Bytes(contractBytes) },
      { path: auditCase.sourceAuditPath, sha256: sha256Bytes(sourceAuditBytes) },
    ],
    scope: { split: "development", taskIds },
    criteria,
    requirements,
    canaries,
  }
  await writeFile(path.join(rootDir, ...`${auditCase.root}/benchmark-contract-audit.json`.split("/")), json(manifest), "utf8")
  return manifest
}

export async function generateMethodCaseContractAuditFixtures(
  rootDir = process.cwd(),
  skillIds?: readonly string[],
) {
  const selected = skillIds === undefined
    ? CASES
    : CASES.filter((auditCase) => skillIds.includes(auditCase.skillId))
  if (selected.length === 0) throw new Error("No method-case audit fixture matched the requested skill")
  return Promise.all(selected.map((auditCase) => generateCase(rootDir, auditCase)))
}

if (import.meta.main) {
  const skillIds = process.argv.slice(2).flatMap((argument) =>
    argument.startsWith("--skill=") ? argument.slice("--skill=".length).split(",").filter(Boolean) : []
  )
  const manifests = await generateMethodCaseContractAuditFixtures(
    process.cwd(),
    skillIds.length > 0 ? skillIds : undefined,
  )
  console.log(JSON.stringify(manifests.map((manifest) => ({
    auditId: manifest.auditId,
    canaries: manifest.canaries.length,
  })), null, 2))
}
