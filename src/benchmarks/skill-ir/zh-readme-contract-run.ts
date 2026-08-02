import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildZhReadmeTaskSet } from "./zh-readme-contract.ts"

const rootDir = process.cwd()
const pilotRoot = path.join(rootDir, "benchmarks/skill-ir/pilots/zh-readme")
const interfaceBytes = await readFile(path.join(pilotRoot, "readme-interface.json"))

for (const split of ["development", "heldout"] as const) {
  const output = path.join(pilotRoot, split, "tasks.json")
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(buildZhReadmeTaskSet(split, interfaceBytes), null, 2)}\n`, "utf8")
}

console.log(JSON.stringify({ skillId: "zh-readme", development: 2, heldout: 2 }, null, 2))
