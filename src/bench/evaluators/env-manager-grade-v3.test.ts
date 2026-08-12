import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import {
  envManagerGradeV3,
  type EnvManagerPublicInterfaceV3,
} from "./env-manager-grade-v3.ts"

const roots: string[] = []
const publicInterface: EnvManagerPublicInterfaceV3 = {
  schemaVersion: "skill-ir-env-manager-interface/v3",
  outputs: {
    example: ".env.example",
    schema: ".env.schema.json",
    report: "env-report.json",
  },
  reportFields: [
    "definedAndUsed",
    "definedUnconfirmedUnused",
    "usedUndefined",
    "hardcodedSecrets",
    "exposureRisks",
  ],
  findingForms: {
    variable: "a variable-name string or an object with a name field",
    located: "a path:name string or an object with path and name fields",
  },
  schemaRepresentations: {
    variablesWrapper: "variables maps names to rules; required is a boolean rule field",
    jsonSchemaObject: "properties maps names to rules; required is the top-level required-name array",
    sensitiveRule: "sensitive true and writeOnly true are equivalent sensitivity markers",
  },
  policy: {
    sensitiveNamePattern: "(?:KEY|TOKEN|PASSWORD|SECRET)$",
    integerNamePattern: "(?:PORT|COUNT)$",
    uriNamePattern: "(?:URL|URI|ORIGIN|DSN)$",
    clientPrefixes: ["VITE_", "NEXT_PUBLIC_", "REACT_APP_", "NUXT_PUBLIC_", "VUE_APP_"],
    secretMinimumLength: 32,
  },
  semantics: {
    definedAndUsed: "defined and referenced",
    definedUnconfirmedUnused: "defined but not statically referenced",
    usedUndefined: "referenced but not defined",
    hardcodedSecrets: "sensitive literal binding",
    exposureRisks: "sensitive client-prefixed reference",
    schemaRequired: "required when referenced",
    schemaRules: "derived from policy patterns",
    additionalMetadata: "allowed when consistent",
    protectedInputs: "all files and directories in the frozen initial workdir manifest",
  },
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "env-manager-v3-"))
  roots.push(root)
  const workDir = path.join(root, "workdir")
  await mkdir(path.join(workDir, "src"), { recursive: true })
  await writeFile(path.join(workDir, ".env"), "APP_PORT=3000\nDB_PASSWORD=TEST_ONLY_DB_PASSWORD\n", "utf8")
  await writeFile(path.join(workDir, "src/config.js"), "const port = process.env.APP_PORT\nconst key = process.env.SENDGRID_API_KEY\n", "utf8")
  await writeFile(path.join(workDir, "LICENSE.upstream"), "source-closure resource\n", "utf8")
  await writeFile(path.join(workDir, "env-audit-interface.json"), `${JSON.stringify(publicInterface, null, 2)}\n`, "utf8")
  const initialWorkdirManifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: path.join(root, "initial-workdir-manifest.json"),
  })
  return { workDir, initialWorkdirManifest }
}

function runResult(workDir: string, initialWorkdirManifest: RunResult["initialWorkdirManifest"]): RunResult {
  return {
    text: "done",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    initialWorkdirManifest,
    runStatus: "ok",
  }
}

async function writeCommonOutputs(workDir: string, schema: unknown): Promise<void> {
  await writeFile(path.join(workDir, ".env.example"), "APP_PORT=3000\nDB_PASSWORD=\nSENDGRID_API_KEY=\n", "utf8")
  await writeFile(path.join(workDir, ".env.schema.json"), JSON.stringify(schema), "utf8")
  await writeFile(path.join(workDir, "env-report.json"), JSON.stringify({
    definedAndUsed: ["APP_PORT"],
    definedUnconfirmedUnused: ["DB_PASSWORD"],
    usedUndefined: ["SENDGRID_API_KEY"],
    hardcodedSecrets: [],
    exposureRisks: [],
  }), "utf8")
}

async function evaluate(
  check: "artifact-integrity" | "artifact-consistency",
  workDir: string,
  initialWorkdirManifest: RunResult["initialWorkdirManifest"],
) {
  return envManagerGradeV3.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-env-manager-v3",
      payload: {
        schemaVersion: "skill-ir-env-manager-eval/v3",
        check,
        interfacePath: "env-audit-interface.json",
      },
    },
    runResult: runResult(workDir, initialWorkdirManifest),
  })
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("env-manager v3 scorer authority repair", () => {
  test("accepts a standard JSON Schema representation with top-level required names", async () => {
    const { workDir, initialWorkdirManifest } = await fixture()
    await writeCommonOutputs(workDir, {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        APP_PORT: { type: "integer", minimum: 1, maximum: 65535 },
        DB_PASSWORD: { type: "string", minLength: 32, writeOnly: true },
        SENDGRID_API_KEY: { type: "string", minLength: 32, writeOnly: true },
      },
      required: ["APP_PORT", "SENDGRID_API_KEY"],
    })

    await expect(evaluate("artifact-consistency", workDir, initialWorkdirManifest))
      .resolves.toMatchObject({ pass: true, score: 1 })
  })

  test("treats every frozen initial-manifest entry as protected without arm-specific path equality", async () => {
    const { workDir, initialWorkdirManifest } = await fixture()
    await writeCommonOutputs(workDir, {
      variables: {
        APP_PORT: { type: "integer", required: true, minimum: 1, maximum: 65535 },
        DB_PASSWORD: { type: "string", required: false, sensitive: true, minLength: 32 },
        SENDGRID_API_KEY: { type: "string", required: true, sensitive: true, minLength: 32 },
      },
    })

    await expect(evaluate("artifact-integrity", workDir, initialWorkdirManifest))
      .resolves.toMatchObject({ pass: true, score: 1 })
  })
})
