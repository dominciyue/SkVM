import { appendFile, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL(".", import.meta.url))
export async function recordStage(stage: string, detail: string, extra: Record<string, unknown> = {}) {
  const statusPath = path.join(root, "status.json")
  const status = JSON.parse(await readFile(statusPath, "utf8"))
  const item = status.stages.find((value: any) => value.id === stage)
  if (!item) throw new Error(`Unknown stage: ${stage}`)
  const at = new Date().toISOString()
  item.status = "complete"; item.completedAt = at; item.detail = detail
  const next = status.stages.find((value: any) => value.status !== "complete")
  if (next) next.status = "in-progress"
  status.updatedAt = at; status.next = next ? `${next.id}: ${next.title}` : "Final publication verification."
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8")
  await appendFile(path.join(root, "journal.jsonl"), `${JSON.stringify({ at, stage, event: "stage-completed", detail, ...extra })}\n`, "utf8")
  await appendFile(path.resolve(root, "../../../../../../conversation_log.md"), `\n## 2026-09-29 — ${stage}\n- ${detail}\n- Stage evidence and affected files: SkVM/results/skill-ir/skill-dsl-research/development/authorization-location-recovery-v3; current taskbook/research documentation updated in the same implementation stage.\n- Next: ${status.next}\n`, "utf8")
}
if (import.meta.main) {
  if (!process.argv[2] || !process.argv[3]) throw new Error("Supply stage and verified detail")
  await recordStage(process.argv[2], process.argv[3])
  console.log(`Recorded ${process.argv[2]}`)
}
