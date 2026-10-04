import path from "node:path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
export const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
export const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
export const tasks = ["owui-ingestion", "paperless-download", "paperless-share-create", "gitea-create-issue"]
export const budgets = { perCallTimeoutMs: 300000, sessionTimeoutMs: 1200000, maxDispatches: 24, maxToolCalls: 48, maxDisplayBytes: 524288, maxFiles: 512, maxReadBytes: 8388608, maxTokens: 6000 }
export async function prepare() {
  const historical = path.resolve(root, "../authorization-domain-execution-v1/model"), oldManifest = JSON.parse(await readFile(path.resolve(root, "../authorization-semantic-lowering-v1/manifest.json"), "utf8"))
  const save = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" }) }
  const taskRecords = []
  for (const id of tasks) {
    const originalFile = path.join(historical, "inputs", `${id}.json`), original = await readFile(originalFile), input = JSON.parse(original.toString("utf8")), file = path.join(root, "model/inputs", `${id}.json`)
    const sourceRoot = path.resolve(path.dirname(originalFile), input.sourceRoot)
    input.sourceRoot = path.relative(path.dirname(file), sourceRoot).split(path.sep).join("/")
    await save(file, input)
    taskRecords.push({ id, admission: "eligible", inputFile: `model/inputs/${id}.json`, inputSha256: sha(await readFile(file)), originalInput: path.relative(root, originalFile).split(path.sep).join("/"), originalInputSha256: sha(original), repository: input.repository, sourceRef: input.sourceRef, allowedPaths: input.allowedPaths, inputChanges: ["sourceRoot mechanical rebasing only"], originalQuestionsAndPolicyPreserved: true })
  }
  const arms = [{ studyArm: "M-L", method: "M", strategy: "legacy" }, { studyArm: "M-F", method: "M", strategy: "focused-closure-v1" }, { studyArm: "D-F", method: "D1", strategy: "focused-closure-v1" }]
  const rows: any[] = tasks.flatMap((task, i) => (i % 2 ? [...arms].reverse() : arms).map(arm => ({ id: `quality-${task}-${arm.studyArm}`, task, kind: "quality", ...arm, inputFile: `model/inputs/${task}.json`, admission: "eligible", components: arm.strategy === "legacy" ? ["wire", "source", "delivery"] : ["wire", "source", "checker", "worklist", "focus", "delivery"] })))
  for (const task of ["paperless-share-create", "gitea-create-issue"]) rows.push({ id: `debug-${task}-D-F`, task, kind: "debug", studyArm: "D-F", method: "D1", strategy: "focused-closure-v1", inputFile: `model/inputs/${task}.json`, admission: "eligible", components: ["wire", "source", "checker", "worklist", "focus", "delivery"] })
  for (const old of oldManifest.rows.filter((r: any) => r.kind === "native")) rows.push({ ...old, sourceSkill: path.relative(root, path.resolve(path.dirname(root), "authorization-semantic-lowering-v1", old.sourceSkill)).split(path.sep).join("/"), strategy: "focused-closure-v1", components: ["wire", "source", "checker", "worklist", "focus", "delivery"], totalProviderBudget: 24, totalToolBudget: 48 })
  const authors = oldManifest.authors.map((a: any) => ({ ...a, sourceSkill: rows.find(r => r.kind === "native" && r.skill === a.skill && r.variant === a.variant).sourceSkill, strategy: "focused-closure-v1" }))
  const seals = JSON.parse(await readFile(path.resolve(root, "../authorization-semantic-lowering-v1/inherited-seals.json"), "utf8"))
  await save(path.join(root, "inherited-seals.json"), { inheritedFrom: "../authorization-semantic-lowering-v1/inherited-seals.json", inheritedSha256: sha(await readFile(path.resolve(root, "../authorization-semantic-lowering-v1/inherited-seals.json"))), unchangedLogicalSeals: seals, sealedTasks: ["paperless-notes", "memos-share", "memos-remove"] })
  await save(path.join(root, "manifest.json"), { schemaVersion: "authorization-at-manifest/v1", development: "adaptive-exposed", testedModel: "xty/gpt-5.6-sol", cachePath: path.join(repo, ".skvm"), baselineRevision: "9c86e9eb510b929da139eb128273ba4442e0ec58", budgets, authorConsumerBudgets: { ...budgets, maxDispatches: 32 }, tasks: taskRecords, arms, rows, authors, modelInputAllowlist: taskRecords.map(t => t.inputFile), evaluatorNeverModelVisible: true, denominators: { debugging: 2, quality: 12, native: 4, authors: 4, authorConsumers: 4, qualifiedPolicyPremise: 4, sourceChangeFresh: 2, conditionalAblationsMaximum: 4 }, costs: { dollars: null, humanMinutes: null, developerUsage: null } })
  return { tasks: taskRecords.length, rows: rows.length, providerCalls: 0 }
}
if (import.meta.main) console.log(JSON.stringify(await prepare()))
