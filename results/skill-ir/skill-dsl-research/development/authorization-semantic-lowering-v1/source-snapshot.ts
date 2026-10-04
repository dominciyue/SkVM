import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createInquiryTools, type InquiryToolsOptions } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
export async function copySourceSnapshot(context: InquiryToolsOptions, destination: string) {
  const tools = await createInquiryTools(context)
  for (const file of tools.files) {
    const target = path.resolve(destination, file.path), relative = path.relative(path.resolve(destination), target)
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Source snapshot path escapes its destination")
    const bytes = await readFile(path.join(context.sourceRoot, file.path))
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Indexed original source changed")
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: "wx" })
  }
  return tools.files
}
