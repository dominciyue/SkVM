import { mkdir, readFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { loadRunSkill, buildRunSkillBundle, materializeNaturalRunTask, prepareRunWorkspace } from "../../../../../src/run/index.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"
import { root, runRoot, originalInput, skillFile, limits, json, write, sha } from "./study.ts"

/** Compare current H against its actual account input without dispatching inference. */
export async function verifyControlCompatibility() {
  const attemptId = "auto-h-1/cli-path-1", directory = path.join(root, "attempts", attemptId)
  const report = await json(path.join(directory, "report.json")), run = JSON.parse(gunzipSync(await readFile(path.join(directory, "inquiry-run.json.gz"))).toString("utf8"))
  const start = run.telemetry.account.events.find((event: any) => event.direction === "client" && event.method === "thread/start").params
  const skill = await loadRunSkill(skillFile), bundle = buildRunSkillBundle(skill, "inject")!.content, input = await json(originalInput)
  const workDir = path.join(runRoot, "control-contract", "program-authoring-1"); await mkdir(workDir, { recursive: true })
  const task = await materializeNaturalRunTask({ prompt: input.brief ?? JSON.stringify(input.inquiry), taskPath: path.join(workDir, "skill-task.json") })
  await prepareRunWorkspace({ task, skill, workDir })
  const runtime = await createNativeInquiryRuntime({ inputFile: originalInput, workDir, strategy: report.strategy, domainTools: true, method: "M", skillContent: bundle, ...limits, traceRedactor: redactCodexEvent })
  try {
    const system = redactCodexEvent(`${bundle}\n${runtime.system}`) as string
    const project = (tool: any) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })
    const currentTools = JSON.parse(JSON.stringify(redactCodexEvent(runtime.definitions.map(project)))), originalTools = start.dynamicTools.map(project)
    const systemUnchanged = start.baseInstructions.includes(system), toolsUnchanged = isDeepStrictEqual(currentTools, originalTools)
    if (!systemUnchanged || !toolsUnchanged) throw new Error(`H contract changed: system=${systemUnchanged}, tools=${toolsUnchanged}`)
    const evidence = { providerCalls: 0, attemptId, originalRuntimeTree: report.runtimeTree, originalSystemSha256: report.actualModelInput.systemSha256, reconstructedSystemFragmentSha256: sha(system), originalToolContractSha256: sha(JSON.stringify(originalTools)), currentToolContractSha256: sha(JSON.stringify(currentTools)), systemUnchanged, toolsUnchanged, originalInputSha256: sha(await readFile(originalInput)), changedPath: "src/benchmarks/authorization-dsl/question-workflow-wire.ts:20", interpretation: "Only the D declaration tool description changed. Actual H system and tool contracts are unchanged; no paired H inference or additional model cost." }
    await write(path.join(root, "verification/program-authoring-control-compatibility.json"), evidence)
    return evidence
  } finally { await runtime.close() }
}
if (import.meta.main) console.log(JSON.stringify(await verifyControlCompatibility()))
