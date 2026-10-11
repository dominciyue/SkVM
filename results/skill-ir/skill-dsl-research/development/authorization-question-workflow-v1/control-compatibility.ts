import { mkdir, readFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { loadRunSkill, buildRunSkillBundle, materializeNaturalRunTask, prepareRunWorkspace } from "../../../../../src/run/index.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"
import { root, runRoot, originalInput, skillFile, limits, json, write, sha } from "./study.ts"

/** Zero-model reconstruction of the unchanged N/H model-visible contracts. */
export async function verifyControlCompatibility(label = "predicate-guide") {
  const skill = await loadRunSkill(skillFile), bundle = buildRunSkillBundle(skill, "inject")!.content, input = await json(originalInput)
  const controls = []
  for (const id of ["quality-n-1", "quality-h-1", "quality-h-2", "quality-n-2"]) {
    const directory = path.join(root, "attempts", id, "original"), report = await json(path.join(directory, "report.json"))
    const run = JSON.parse(gunzipSync(await readFile(path.join(directory, "inquiry-run.json.gz"))).toString("utf8"))
    const start = run.telemetry.account.events.find((e: any) => e.direction === "client" && e.method === "thread/start").params
    const workDir = path.join(runRoot, "control-contract", id); await mkdir(workDir, { recursive: true })
    const task = await materializeNaturalRunTask({ prompt: input.brief ?? JSON.stringify(input.inquiry), taskPath: path.join(workDir, "skill-task.json") })
    await prepareRunWorkspace({ task, skill, workDir })
    const runtime = await createNativeInquiryRuntime({ inputFile: originalInput, workDir, strategy: report.strategy, domainTools: report.domainTools, method: report.domainTools ? report.method : undefined, skillContent: bundle, ...limits, traceRedactor: redactCodexEvent })
    try {
      const system = redactCodexEvent(`${bundle}\n${runtime.system}`) as string
      const project = (t: any) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })
      const currentTools = JSON.parse(JSON.stringify(redactCodexEvent(runtime.definitions.map(project))))
      const originalTools = start.dynamicTools.map(project)
      const systemUnchanged = start.baseInstructions.includes(system), toolsUnchanged = isDeepStrictEqual(originalTools, currentTools)
      const guideAbsent = !JSON.stringify(start).includes('op:\\"truthy\\"') && !originalTools.some((t: any) => t.name === "authorization_declare")
      if (!systemUnchanged || !toolsUnchanged || !guideAbsent) throw new Error(`N/H contract changed: ${id}: system=${systemUnchanged}, tools=${toolsUnchanged}, guideAbsent=${guideAbsent}`)
      controls.push({ attemptId: `${id}/original`, originalRuntimeTree: report.runtimeTree, originalSystemSha256: report.actualModelInput.systemSha256, reconstructedSystemSha256: sha(system), originalToolContractSha256: sha(JSON.stringify(originalTools)), currentToolContractSha256: sha(JSON.stringify(currentTools)), systemUnchanged, toolsUnchanged, guideAbsent, source: "actual original thread/start versus current runtime, no inference from arm labels" })
    } finally { await runtime.close() }
  }
  const evidence = { providerCalls: 0, controls, changedPaths: label === "partial-source" ? ["src/task-dsl/authorization/source-interpretation.ts:177-182"] : ["src/task-dsl/authorization/control-evaluation.ts:7", "src/benchmarks/authorization-dsl/question-workflow-wire.ts:19"], routingEvidence: ["src/benchmarks/authorization-dsl/question-workflow-wire.ts:13-14", "src/benchmarks/authorization-dsl/inquiry-native.ts:129-130", "src/benchmarks/authorization-dsl/inquiry-native.ts:298-301", "src/benchmarks/authorization-dsl/inquiry-native.ts:335"], interpretation: label === "partial-source" ? "Exact unchanged N/H system and tool contracts. Legacy N and independent H do not lower D source interpretations; the shared progressive-source repair affects D and other existing property-context strategies, not N/H. No new model control or cost." : "Only the D declaration/current-source guide changes among N/H/D. Other preexisting semantic strategies also use the shared guide; no claim that all strategies are unchanged." }
  await write(path.join(root, "verification", `${label}-control-compatibility.json`), evidence, true)
  return evidence
}
if (import.meta.main) console.log(JSON.stringify(await verifyControlCompatibility(process.argv[2])))
