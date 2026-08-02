import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildZhCodeReviewerTaskSet } from "./zh-code-reviewer-contract.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const pilotRoot = path.join(rootDir, "benchmarks/skill-ir/pilots/zh-code-reviewer")
const interfaceBytes = await readFile(path.join(pilotRoot, "review-interface.json"))

for (const split of ["development", "heldout"] as const) {
  const outputDir = path.join(pilotRoot, split)
  await mkdir(outputDir, { recursive: true })
  const taskSet = buildZhCodeReviewerTaskSet(split, interfaceBytes)
  await writeFile(path.join(outputDir, "tasks.json"), `${JSON.stringify(taskSet, null, 2)}\n`, "utf8")
}

console.log(JSON.stringify({ skillId: "zh-code-reviewer", development: 2, heldout: 2 }, null, 2))
