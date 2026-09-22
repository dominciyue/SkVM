import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "./local-run.ts"
import { loadLocalAuthorizationInput } from "./local-input.ts"
import { validMarkdownStudyInput } from "../../task-dsl/authorization/render.ts"
import type { MarkdownStudyInput } from "../../task-dsl/authorization/render.ts"
export type { MarkdownStudyInput } from "../../task-dsl/authorization/render.ts"
export type ExternalReuseArm = "markdown" | "dsl"
export async function executeMarkdownStudyRun(input: Omit<Parameters<typeof executeLocalAuthorizationRun>[0],"method"|"wireVersion"|"arm"|"studyArm"> & {markdown:MarkdownStudyInput}) {
  const {markdown, ...local} = input
  if (validMarkdownStudyInput(markdown)) {
    let exists = false
    try { exists = (await stat(path.join(input.outRoot,"sessions.jsonl"))).isFile() }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    if (exists) {
      const report = await inspectLocalAuthorizationOutput(input.outRoot)
      const descriptor = JSON.parse(await readFile(path.join(report.sessionPath,"session.json"),"utf8"))
      const retained = JSON.parse(await readFile(path.join(report.sessionPath,"research-instructions.json"),"utf8"))
      const loaded = await loadLocalAuthorizationInput(input.inputFile)
      const hash = (s:string) => createHash("sha256").update(s).digest("hex")
      const bundle = JSON.parse(await readFile(path.join(report.sessionPath,"source-bundle.json"),"utf8"))
      if (loaded.status !== "valid" || descriptor.model !== input.model
          || descriptor.inputSha256 !== hash(loaded.rawInput)
          || retained.sha256 !== hash(markdown.instructions)
          || retained.instructions !== markdown.instructions || retained.instructionOrigin !== markdown.instructionOrigin
          || retained.instructionPath !== markdown.instructionPath
          || JSON.stringify(bundle) !== JSON.stringify(loaded.sourceBundle)) {
        throw new Error("Markdown study resume identity differs; preserve this unit and use a separately registered revision.")
      }
      // A dispatched or terminal unit is never resent, including unknown completion.
      return report
    }
  }
  return executeLocalAuthorizationRun({...local,method:"plain",wireVersion:"v4",arm:"B",researchInstructions:markdown})
}
