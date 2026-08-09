import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

type JsonObject = Record<string, any>

const SOURCE_ROOT = "benchmarks/skill-ir/pilots/i18n-helper/v2"
const TARGET_ROOT = "benchmarks/skill-ir/pilots/i18n-helper/v3"

function arraySchema(order: "ordered" | "set-like") {
  return {
    type: "array",
    nullable: false,
    order,
    duplicates: "forbid",
    items: { type: "string", nullable: false },
  }
}

export function buildI18nHelperV3Contract(v2: JsonObject): JsonObject {
  return {
    ...v2,
    schemaVersion: "skill-ir-i18n-helper-public-contract/v3",
    contractId: "i18n-helper-react-i18next-v3",
    outputAbi: {
      schemaVersion: "skill-ir-public-output-abi/v2",
      additionalProperties: false,
      fields: {
        framework: structuredClone(v2.outputAbi.fields.framework),
        scannedFiles: { required: true, schema: arraySchema("ordered") },
        extractedKeys: { required: true, schema: arraySchema("set-like") },
        missingKeys: {
          required: true,
          schema: {
            type: "object",
            nullable: false,
            additionalProperties: false,
            fields: {
              "zh-CN": { required: true, schema: arraySchema("set-like") },
              "en-US": { required: true, schema: arraySchema("set-like") },
            },
          },
        },
      },
    },
  }
}

function replaceIdentity(value: string): string {
  return value
    .replaceAll("i18n-helper-v2", "i18n-helper-v3")
    .replaceAll("skill-ir-i18n-helper-public-contract/v2", "skill-ir-i18n-helper-public-contract/v3")
    .replaceAll("skill-ir-i18n-helper-eval/v2", "skill-ir-i18n-helper-eval/v3")
}

function buildTaskSet(v2: JsonObject, contract: JsonObject): JsonObject {
  const result = structuredClone(v2)
  result.skillId = "i18n-helper-v3"
  for (const task of result.tasks as JsonObject[]) {
    task.id = replaceIdentity(task.id)
    task.fixtures["i18n-contract.json"] = JSON.stringify(contract)
    for (const criterion of task.eval as JsonObject[]) {
      criterion.id = replaceIdentity(criterion.id)
      criterion.evaluatorId = replaceIdentity(criterion.evaluatorId)
      criterion.payload.schemaVersion = replaceIdentity(criterion.payload.schemaVersion)
    }
    task.hardGateIds = task.hardGateIds.map((id: string) => replaceIdentity(id))
  }
  return result
}

function buildSourceAudit(v2: JsonObject): JsonObject {
  const audit = structuredClone(v2)
  audit.contractId = "i18n-helper-react-i18next-v3"
  audit.claims = [
    ...audit.claims.filter((claim: JsonObject) => claim.id !== "typed-report-output"),
    {
      id: "typed-report-output",
      origin: "task-contract",
      quote: "The public report declares recursive field types and locale-keyed missing-key arrays.",
    },
    {
      id: "array-semantics",
      origin: "task-contract",
      quote: "The public output ABI declares ordered or set-like semantics and duplicate policy for every array.",
    },
  ]
  return audit
}

async function readJson(rootDir: string, relativePath: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path.resolve(rootDir, relativePath), "utf8")) as JsonObject
}

async function writeJson(rootDir: string, relativePath: string, value: unknown): Promise<void> {
  const target = path.resolve(rootDir, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function generateI18nHelperV3TaskFreeze(rootDir = process.cwd()): Promise<void> {
  const [v2Contract, development, heldout, sourceAudit] = await Promise.all([
    readJson(rootDir, `${SOURCE_ROOT}/public-contract.json`),
    readJson(rootDir, `${SOURCE_ROOT}/development/tasks.json`),
    readJson(rootDir, `${SOURCE_ROOT}/heldout/tasks.json`),
    readJson(rootDir, `${SOURCE_ROOT}/public-contract-source-audit.json`),
  ])
  const contract = buildI18nHelperV3Contract(v2Contract)
  await Promise.all([
    writeJson(rootDir, `${TARGET_ROOT}/public-contract.json`, contract),
    writeJson(rootDir, `${TARGET_ROOT}/public-contract-source-audit.json`, buildSourceAudit(sourceAudit)),
    writeJson(rootDir, `${TARGET_ROOT}/development/tasks.json`, buildTaskSet(development, contract)),
    writeJson(rootDir, `${TARGET_ROOT}/heldout/tasks.json`, buildTaskSet(heldout, contract)),
  ])
}

if (import.meta.main) {
  await generateI18nHelperV3TaskFreeze()
  console.log(JSON.stringify({ status: "generated", target: TARGET_ROOT }, null, 2))
}
