import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  runExperimentalDesignV2HarderDifferentialAudit,
  runExperimentalDesignV2HarderMaterializationAudit,
} from "./experimental-design-v2-harder-audit.ts"
import {
  buildExperimentalDesignV2HarderDevelopmentTaskSet,
  buildExperimentalDesignV2SaturationAudit,
  validateExperimentalDesignV2HarderDevelopmentTaskSet,
} from "./experimental-design-v2-harder-development.ts"

const PATHS = {
  contract: "benchmarks/skill-ir/pilots/experimental-design/v2/public-contract.json",
  oldTasks: "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json",
  harderTasks: "benchmarks/skill-ir/pilots/experimental-design/v2/harder-development/tasks.json",
  gate: "results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/gate-report.json",
  analysis:
    "results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/calibration-analysis.json",
  saturation:
    "results/skill-ir/experimental-design-v2-harder-development-saturation-audit-2026-07-31.json",
  differential:
    "results/skill-ir/experimental-design-v2-harder-development-contract-audit-2026-07-31.json",
  materialization:
    "results/skill-ir/experimental-design-v2-harder-development-materialization-audit-2026-07-31.json",
} as const

function absolute(rootDir: string, relativePath: string): string {
  return path.join(rootDir, ...relativePath.split("/"))
}

async function writeJson(rootDir: string, relativePath: string, value: unknown): Promise<void> {
  const target = absolute(rootDir, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function writeExperimentalDesignV2HarderAuditArtifacts(
  rootDir = process.cwd(),
): Promise<{
  tasks: string
  saturation: string
  differential: string
  materialization: string
}> {
  const [publicContractBytes, gateBytes, analysisBytes, oldTaskSetBytes] = await Promise.all([
    readFile(absolute(rootDir, PATHS.contract)),
    readFile(absolute(rootDir, PATHS.gate)),
    readFile(absolute(rootDir, PATHS.analysis)),
    readFile(absolute(rootDir, PATHS.oldTasks)),
  ])
  const generatedTaskSet = buildExperimentalDesignV2HarderDevelopmentTaskSet(publicContractBytes)
  await writeJson(rootDir, PATHS.harderTasks, generatedTaskSet)
  const taskSet = validateExperimentalDesignV2HarderDevelopmentTaskSet(
    JSON.parse(await readFile(absolute(rootDir, PATHS.harderTasks), "utf8")),
    publicContractBytes,
  )
  const saturation = buildExperimentalDesignV2SaturationAudit({
    gateBytes,
    analysisBytes,
    taskSetBytes: oldTaskSetBytes,
    publicContractBytes,
  })
  const differential = await runExperimentalDesignV2HarderDifferentialAudit({
    rootDir,
    taskSet,
    publicContractBytes,
  })
  const materialization = await runExperimentalDesignV2HarderMaterializationAudit({
    rootDir,
    taskSet,
  })
  await Promise.all([
    writeJson(rootDir, PATHS.saturation, saturation),
    writeJson(rootDir, PATHS.differential, differential),
    writeJson(rootDir, PATHS.materialization, materialization),
  ])
  return {
    tasks: PATHS.harderTasks,
    saturation: PATHS.saturation,
    differential: PATHS.differential,
    materialization: PATHS.materialization,
  }
}

if (import.meta.main) {
  const outputs = await writeExperimentalDesignV2HarderAuditArtifacts()
  console.log(JSON.stringify({ status: "passed", outputs }, null, 2))
}
