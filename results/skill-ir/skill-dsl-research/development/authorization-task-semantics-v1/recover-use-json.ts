import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { AuthorizationAuthoringInputV2Schema } from "../../../../../src/benchmarks/authorization-dsl/authoring-v2.ts"
import { loadLocalAuthorizationInputValue } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"

const root = import.meta.dir
const id = "gitea-relation-change-dsl-changed"
const attempt = JSON.parse(await readFile(path.join(root, "author-attempts", "use", `${id}-attempt2.json`), "utf8"))
const raw = attempt.response.text.trim()
if (!raw.endsWith("}")) throw Error("The diagnosed repair is not a trailing-brace case")
try { JSON.parse(raw); throw Error("The author's output is already valid; do not recover") }
catch (error) { if (error instanceof Error && error.message.includes("already valid")) throw error }
const recovered = raw.slice(0, -1)
const parsed = JSON.parse(recovered)
const schema = AuthorizationAuthoringInputV2Schema.safeParse(parsed)
if (!schema.success) throw Error(JSON.stringify(schema.error.issues))
const deliveryDir = path.join(root, "author-packages", "gitea-relation-change", "dsl")
const output = path.join(deliveryDir, "changed.json")
const checked = await loadLocalAuthorizationInputValue(parsed, output)
if (checked.status !== "valid") throw Error(JSON.stringify(checked.diagnostics))
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const receipt = { id, authorFirstDelivery: "invalid-json", authorDiagnosticRepair: "invalid-json", consumerInputStatus: "machine-recovered",
  transformation: "Remove exactly the final extra closing brace from the second author response; no field or string was changed.",
  removedCharacterOffset: raw.length - 1, removedCharacter: "}", rawSha256: hash(raw), recoveredSha256: hash(recovered), checkStatus: checked.status,
  authorSuccessCountContribution: 0 }
await writeFile(output, `${recovered}\n`, { flag: "wx" })
await writeFile(path.join(deliveryDir, "changed-check.json"), `${JSON.stringify({ id, status: "machine-recovered", diagnostics: [], recovery: "recovery.json" }, null, 2)}\n`, { flag: "wx" })
await writeFile(path.join(deliveryDir, "recovery.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" })
console.log(JSON.stringify(receipt))
