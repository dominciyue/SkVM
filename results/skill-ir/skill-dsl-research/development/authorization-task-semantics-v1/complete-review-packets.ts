import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const evaluator = path.join(root, "evaluator")
const mapFile = path.join(evaluator, "review-map.json")
const rawMap = await readFile(mapFile, "utf8")
const map = JSON.parse(rawMap)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const repair = Object.entries(map.map).find(([, value]: [string, any]) => value.unitId === "initial-fastapi-superuser-supplied-path-M1" && value.generation === "repair") as [string, any] | undefined
if (!repair) throw Error("Missing repaired unit review packet")
const [repairId, identity] = repair
const anonymousId = `r-${hash(`${map.salt}/${identity.unitId}/initial`).slice(0, 12)}`
if (map.map[anonymousId]) throw Error("Initial review packet already exists")
const packet = JSON.parse(await readFile(path.join(evaluator, "packets", `${repairId}.json`), "utf8"))
const unit = JSON.parse(await readFile(path.join(root, "runs", identity.unitId, "unit.json"), "utf8"))
const run = JSON.parse(await readFile(path.join(unit.report.sessionPath, "run.json"), "utf8"))
const artifact = run.initialTransport
if (!artifact?.rawResponse || run.initial) throw Error("Expected separate first transport delivery")
packet.anonymousId = anonymousId
packet.answer = { rawResponse: artifact.rawResponse, wireResult: artifact.wireResult ?? null, canonicalResult: artifact.result ?? null, validation: artifact.validation ?? null }
const serialized = `${JSON.stringify(packet, null, 2)}\n`
await writeFile(path.join(evaluator, "review-map-before-transport-completion.json"), rawMap, { flag: "wx" })
await writeFile(path.join(evaluator, "packets", `${anonymousId}.json`), serialized, { flag: "wx" })
map.map[anonymousId] = { ...identity, generation: "initial", rawOutputSha256: hash(artifact.rawResponse), packetSha256: hash(serialized) }
await writeFile(mapFile, `${JSON.stringify(map, null, 2)}\n`)
console.log(JSON.stringify({ packets: Object.keys(map.map).length, initialTransportPacket: anonymousId }))
