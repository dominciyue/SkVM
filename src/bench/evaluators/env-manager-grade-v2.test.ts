import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import {
  deriveEnvironmentOracle,
  envManagerGradeV2,
  type EnvManagerPublicInterface,
} from "./env-manager-grade-v2.ts"

const roots: string[] = []
const publicInterface: EnvManagerPublicInterface = {
  schemaVersion: "skill-ir-env-manager-interface/v2",
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
  },
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "env-manager-v2-"))
  roots.push(root)
  const workDir = path.join(root, "workdir")
  await mkdir(path.join(workDir, "src"), { recursive: true })
  const files = {
    ".env": "APP_PORT=3000\nREDIS_URL=redis://localhost:6379\nDB_PASSWORD=TEST_ONLY_DB_PASSWORD\nOLD_API_KEY=TEST_ONLY_OLD_KEY\n",
    "src/config.js": "const port = Number(process.env.APP_PORT)\nconst redis = process.env.REDIS_URL\nconst mail = process.env.SENDGRID_API_KEY\n",
    "src/auth.js": "const INTERNAL_TOKEN = \"TEST_ONLY_INTERNAL_TOKEN\"\n",
    "env-audit-interface.json": `${JSON.stringify(publicInterface, null, 2)}\n`,
  }
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(path.join(workDir, ...relativePath.split("/")), content, "utf8")
  }
  const initialWorkdirManifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: path.join(root, "initial-workdir-manifest.json"),
  })
  return { root, workDir, files, initialWorkdirManifest }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("env-manager v2 source-derived oracle", () => {
  test("changes when public source evidence changes and ignores task labels", () => {
    const files = {
      ".env": "APP_PORT=3000\nOLD_API_KEY=TEST_ONLY_OLD_KEY\n",
      "src/config.js": "const port = process.env.APP_PORT\n",
    }
    const first = deriveEnvironmentOracle(files, publicInterface)
    const relabeled = deriveEnvironmentOracle({ ...files }, publicInterface)
    expect(relabeled).toEqual(first)

    const withoutReference = deriveEnvironmentOracle({
      ...files,
      "src/config.js": "export const port = 3000\n",
    }, publicInterface)
    expect(first.definedAndUsed).toEqual(["APP_PORT"])
    expect(withoutReference.definedAndUsed).toEqual([])
    expect(withoutReference.definedUnconfirmedUnused).toContain("APP_PORT")
  })

  test("derives missing, secret, exposure, and schema rules from workspace evidence", () => {
    const oracle = deriveEnvironmentOracle({
      ".env": "VITE_API_URL=https://example.test\nVITE_PUBLIC_TOKEN=TEST_ONLY_PUBLIC_TOKEN\nSERVER_SECRET=TEST_ONLY_SERVER_SECRET\n",
      "src/client.ts": "export const api = import.meta.env.VITE_API_URL\nexport const token = import.meta.env.VITE_PUBLIC_TOKEN\n",
      "src/server.ts": "export const secret = process.env.SERVER_SECRET\nexport const dsn = process.env.SENTRY_DSN\n",
    }, publicInterface)
    expect(oracle.usedUndefined).toEqual(["SENTRY_DSN"])
    expect(oracle.exposureRisks).toEqual(["src/client.ts:VITE_PUBLIC_TOKEN"])
    expect(oracle.schemaRules.VITE_API_URL).toMatchObject({ type: "string", required: true, format: "uri" })
    expect(oracle.schemaRules.SERVER_SECRET).toMatchObject({ sensitive: true, minLength: 32 })
  })
})

describe("env-manager v2 semantic evaluator", () => {
  test("accepts reordered object-form findings and extra explanatory metadata", async () => {
    const { workDir, initialWorkdirManifest } = await fixture()
    await writeFile(path.join(workDir, ".env.example"), [
      "APP_PORT=3000",
      "REDIS_URL=redis://localhost:6379",
      "DB_PASSWORD=",
      "OLD_API_KEY=",
      "SENDGRID_API_KEY=",
      "",
    ].join("\n"), "utf8")
    await writeFile(path.join(workDir, ".env.schema.json"), JSON.stringify({
      variables: {
        SENDGRID_API_KEY: { type: "string", required: true, sensitive: true, minLength: 32, description: "mail provider" },
        APP_PORT: { type: "integer", required: true, minimum: 1, maximum: 65535 },
        REDIS_URL: { type: "string", required: true, format: "uri" },
        DB_PASSWORD: { type: "string", required: false, sensitive: true, minLength: 32 },
        OLD_API_KEY: { type: "string", required: false, sensitive: true, minLength: 32 },
      },
    }), "utf8")
    await writeFile(path.join(workDir, "env-report.json"), JSON.stringify({
      definedAndUsed: [{ name: "REDIS_URL" }, { name: "APP_PORT", evidence: "src/config.js" }],
      definedUnconfirmedUnused: [{ name: "OLD_API_KEY" }, { name: "DB_PASSWORD" }],
      usedUndefined: [{ name: "SENDGRID_API_KEY" }],
      hardcodedSecrets: [{ path: "src/auth.js", name: "INTERNAL_TOKEN" }],
      exposureRisks: [],
      notes: ["Static non-reference remains unconfirmed."],
    }), "utf8")

    const runResult: RunResult = {
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
    for (const check of ["artifact-integrity", "environment-analysis", "artifact-consistency"] as const) {
      const result = await envManagerGradeV2.run({
        criterion: {
          method: "custom",
          evaluatorId: "skill-ir-env-manager-v2",
          payload: {
            schemaVersion: "skill-ir-env-manager-eval/v2",
            check,
            interfacePath: "env-audit-interface.json",
            protectedPaths: [".env", "src/config.js", "src/auth.js", "env-audit-interface.json"],
          },
        },
        runResult,
      })
      expect(result).toMatchObject({ pass: true, score: 1 })
    }
  })

  test("fails a source-inconsistent classification without treating it as infrastructure", async () => {
    const { workDir, initialWorkdirManifest } = await fixture()
    await writeFile(path.join(workDir, ".env.example"), "APP_PORT=3000\n", "utf8")
    await writeFile(path.join(workDir, ".env.schema.json"), '{"variables":{}}', "utf8")
    await writeFile(path.join(workDir, "env-report.json"), JSON.stringify({
      definedAndUsed: [],
      definedUnconfirmedUnused: [],
      usedUndefined: [],
      hardcodedSecrets: [],
      exposureRisks: [],
    }), "utf8")
    const result = await envManagerGradeV2.run({
      criterion: {
        method: "custom",
        evaluatorId: "skill-ir-env-manager-v2",
        payload: {
          schemaVersion: "skill-ir-env-manager-eval/v2",
          check: "environment-analysis",
          interfacePath: "env-audit-interface.json",
          protectedPaths: [".env", "src/config.js", "src/auth.js", "env-audit-interface.json"],
        },
      },
      runResult: {
        text: "done", steps: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0,
        durationMs: 0, llmDurationMs: 0, workDir, initialWorkdirManifest, runStatus: "ok",
      },
    })
    expect(result).toMatchObject({ pass: false, score: 0 })
    expect(result.infraError).toBeUndefined()
  })
})
