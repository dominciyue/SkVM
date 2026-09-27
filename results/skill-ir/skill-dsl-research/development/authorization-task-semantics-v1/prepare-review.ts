import { createHash, randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const configBytes = await readFile(path.join(root, "panel-config.json"))
const config = JSON.parse(configBytes.toString("utf8"))
const configSha256 = hash(configBytes)
const account = await readJson(path.join(root, "generation-account.json"))
if (account.configSha256 !== configSha256 || account.planned !== 54 || account.rows.some((row: any) => row.status === "not-dispatched" || row.status === "completion-unknown")) throw Error("Generation block must close before review")
const publicRequirements = await readJson(path.join(root, "public-requirements.json"))
const rubric = await readJson(path.join(root, "rubric.json"))
const evaluatorRoot = path.join(root, "evaluator")
const packetsRoot = path.join(evaluatorRoot, "packets")
await mkdir(packetsRoot, { recursive: true })
const salt = randomBytes(16).toString("hex")
const mapping: Record<string, { unitId: string; phase: string; arm: string; caseId: string; generation: string; rawOutputSha256: string; packetSha256: string }> = {}
for (const unit of config.units) {
  const item = config.cases.find((candidate: any) => candidate.id === unit.caseId)
  const requirement = publicRequirements.cases.find((candidate: any) => candidate.id === unit.caseId)
  if (!item || !requirement) throw Error(`Unregistered review case ${unit.id}`)
  const stored = await readJson(path.join(root, "runs", unit.id, "unit.json"))
  if (stored.configSha256 !== configSha256) throw Error(`Review identity drift ${unit.id}`)
  if (stored.report.status !== "completed") continue
  const session = path.join(root, "runs", unit.id, "sessions", stored.report.sessionId)
  const run = await readJson(path.join(session, "run.json"))
  const sourceBundle = await readJson(path.join(session, "source-bundle.json"))
  const authored = await readJson(path.join(repo, item.input.path))
  for (const generation of ["initial", "repair"] as const) {
    const artifact = generation === "initial" ? run.initial ?? run.initialTransport : run.repair
    if (!artifact?.rawResponse) continue
    const anonymousId = `r-${hash(`${salt}/${unit.id}/${generation}`).slice(0, 12)}`
    const packet = { schemaVersion: "authorization-ai-blind-review-packet/v1", anonymousId, caseId: unit.caseId,
      publicTask: { commonInstruction: publicRequirements.commonInstruction, requirement, acceptedPolicies: authored.policies },
      source: { repository: sourceBundle.repository, sourceRef: sourceBundle.sourceRef, files: sourceBundle.files.map((file: any) => ({ path: file.relativePath, content: file.content })) },
      answer: { rawResponse: artifact.rawResponse, wireResult: artifact.wireResult ?? null, canonicalResult: artifact.result ?? null, validation: artifact.validation ?? null },
      rubric: { primaryFullRule: rubric.primaryFullRule, dimensions: rubric.dimensions, specialChecks: rubric.specialChecks },
      instruction: "Judge the actual semantic answer from the fixed source and public task. Accept equivalent wording. Check source locations against this crop. Separate observed behavior from policy label, demanded branches from unrequested detail, justified unknown from over-abstention. The packet hides representation and support arm. Return one record keyed only by anonymousId; do not infer arm identity." }
    const serialized = `${JSON.stringify(packet, null, 2)}\n`
    await writeFile(path.join(packetsRoot, `${anonymousId}.json`), serialized, { flag: "wx" })
    mapping[anonymousId] = { unitId: unit.id, phase: unit.phase, arm: unit.arm, caseId: unit.caseId, generation, rawOutputSha256: hash(artifact.rawResponse), packetSha256: hash(serialized) }
  }
}
const reviewMap = { schemaVersion: "authorization-ai-review-map/v1", configSha256, salt, generatedAfterAllPanelUnitsClosed: true, map: mapping }
await writeFile(path.join(evaluatorRoot, "review-map.json"), `${JSON.stringify(reviewMap, null, 2)}\n`, { flag: "wx" })
console.log(JSON.stringify({ registered: config.units.length, completed: account.statuses.completed, packets: Object.keys(mapping).length, byCase: Object.fromEntries(config.cases.map((item: any) => [item.id, Object.values(mapping).filter(row => row.caseId === item.id).length])) }))
