import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { base, load, save, hash, relative } from "./study.ts"
import { panelOrder } from "./panel.ts"
/** Copies for independent read-only reviewers. Mapping stays outside packets. */
export async function prepareReviewPackets() {
  const ledger: any[] = await load(path.join(base, "attempts.json")), mapping = [], packets = []
  for (const position of panelOrder) {
    const attempt = ledger.find(a => a.position === position && a.attempt === "first")
    if (!attempt || attempt.status === "running") continue
    const answerFile = path.join(base, `evaluation/answers/${position}-first.txt`), firstFile = path.join(base, `evaluation/answers/${position}-first-first.txt`)
    const text = await readFile(answerFile, "utf8"), first = await readFile(firstFile, "utf8")
    const id = hash(`BP blinded original answer\n${position}`).slice(0, 12), target = path.join(base, `evaluation/blind/answer-${id}.txt`)
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, text, "utf8")
    const profile = position.split("-")[0], delivery = attempt.answerDelivery === "delivered" ? "delivered" : "undelivered"
    packets.push({ id, profile, answer: relative(target), delivery, rubric: relative(path.join(base, "evaluation/rubric.json")), input: attempt.input, instruction: "Review original text semantically against source and all original questions. Return all21 fact IDs with labels, concise answer quote/line and source rationale; four question scores plus whole full/partial/incorrect. Do not infer unstated facts. Do not read identity mapping, other answers, study.ts or program artifacts. Reviewers cannot completely avoid treatment clues in the answer itself; labels and filenames hide arm identity only." })
    mapping.push({ id, position, original: relative(answerFile), sha256: hash(text), firstAnswer: relative(firstFile), firstSha256: hash(first), firstEqualsFinal: first === text, firstEmpty: !first.trim(), delivery })
  }
  await save(path.join(base, "evaluation/review-identity-map.json"), mapping)
  await save(path.join(base, "evaluation/blind/packets.json"), packets)
  return { packets: packets.length, firstEqualsFinal: mapping.filter(m => m.firstEqualsFinal).length, firstEmpty: mapping.filter(m => m.firstEmpty).length }
}
if (import.meta.main) console.log(JSON.stringify(await prepareReviewPackets()))
