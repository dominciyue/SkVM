import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  buildStatisticalPowerDevelopmentAuthorization,
  buildStatisticalPowerDevelopmentTaskSet,
  buildStatisticalPowerPublicInterface,
} from "./statistical-power-contract.ts"

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export async function writeStatisticalPowerContract(rootDir = process.cwd()) {
  const pilotRoot = path.join(rootDir, "benchmarks/skill-ir/pilots/statistical-power")
  const developmentRoot = path.join(pilotRoot, "development")
  const selectionPolicyPath = path.join(rootDir, "benchmarks/skill-ir/corpus/prospective-dynamic-candidate.json")
  const selectionReportPath = path.join(rootDir, "results/skill-ir/prospective-dynamic-candidate.json")
  const [selectionPolicyBytes, selectionReportBytes] = await Promise.all([
    readFile(selectionPolicyPath),
    readFile(selectionReportPath),
  ])
  const selectionPolicy = JSON.parse(selectionPolicyBytes.toString("utf8")) as { selectedSkillId?: unknown }
  const selectionReport = JSON.parse(selectionReportBytes.toString("utf8")) as { selectedSkillId?: unknown; nextStage?: unknown }
  if (
    selectionPolicy.selectedSkillId !== "statistical-power"
    || selectionReport.selectedSkillId !== "statistical-power"
    || selectionReport.nextStage !== "benchmark-contract"
  ) {
    throw new Error("statistical-power contract requires the frozen pre-contract selection")
  }

  const publicInterface = buildStatisticalPowerPublicInterface()
  const taskSet = buildStatisticalPowerDevelopmentTaskSet(publicInterface)
  const interfaceBytes = Buffer.from(json(publicInterface), "utf8")
  const taskBytes = Buffer.from(json(taskSet), "utf8")
  const authorization = buildStatisticalPowerDevelopmentAuthorization({
    taskSetSha256: sha256(taskBytes),
    publicInterfaceSha256: sha256(interfaceBytes),
    selectionPolicySha256: sha256(selectionPolicyBytes),
    selectionReportSha256: sha256(selectionReportBytes),
  })

  await mkdir(developmentRoot, { recursive: true })
  await Promise.all([
    writeFile(path.join(pilotRoot, "public-interface.json"), interfaceBytes),
    writeFile(path.join(developmentRoot, "tasks.json"), taskBytes),
    writeFile(path.join(pilotRoot, "development-authorization.json"), json(authorization), "utf8"),
  ])
  return {
    publicInterface: "benchmarks/skill-ir/pilots/statistical-power/public-interface.json",
    developmentTasks: "benchmarks/skill-ir/pilots/statistical-power/development/tasks.json",
    authorization: "benchmarks/skill-ir/pilots/statistical-power/development-authorization.json",
    taskIds: taskSet.tasks.map((task) => task.id),
    maximumPaidCallsAcrossEligiblePhases: authorization.maximumPaidCallsAcrossEligiblePhases,
  }
}

if (import.meta.main) {
  console.log(JSON.stringify(await writeStatisticalPowerContract(), null, 2))
}
