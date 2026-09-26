import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

// Human-reviewed decisions from the frozen 24-unit answer packet. The repeated
// reasons reflect the same four responses addressing each fixed case rubric.
const reasons: Record<string, Record<string, string>> = {
  "linkding-remove-original": {
    "decision-control": "The answer identifies owner=request.user in bookmark_write as the decisive write gate and correctly says the non-owner is denied.",
    "binding-effect": "It follows the posted remove ID through handle_action and the owner-bound lookup, stopping before bookmark.delete for this non-owner.",
    "scenario-explanation": "It applies the authenticated ordinary non-owner relation, distinguishing shared reading from ownership and the absent role bypass.",
    "bounded-evidence": "It separates stipulated request, identity, and framework behavior from source observations and confines the decision to the supplied path.",
    "http-detail": "The answer or its authored fact statements describe the not-found behavior of the denied owner lookup; a numeric status is optional.",
  },
  "linkding-remove-changed": {
    "decision-control": "The answer identifies the owner-scoped write lookup and correctly says the stated owner is allowed.",
    "binding-effect": "It tracks the posted bookmark ID and request.user through bookmark_write to the reachable bookmark.delete call.",
    "scenario-explanation": "It explains why changing from shared non-owner to owner changes the result, while ordinary role and sharing flags do not grant write access.",
    "bounded-evidence": "It limits the claim to the supplied source and distinguishes task assumptions from observed authorization control.",
    "http-detail": "The answer or its authored fact statements describe the lookup's not-found behavior for a non-owner or the response path; a numeric status is optional.",
  },
  "linkding-asset-original": {
    "decision-control": "The answer identifies the asset_read/bookmark_read gate and correctly applies the authenticated shared-reader branch to allow this GET.",
    "binding-effect": "It binds route asset_id to the asset, follows its bookmark_id to the separately checked bookmark, then reaches file streaming.",
    "scenario-explanation": "It explains why the authenticated non-owner can read when sharing and owner enable_sharing are true, without public sharing.",
    "bounded-evidence": "It confines the conclusion to the fixed source and stated identity, settings, method, and file assumptions.",
    "http-detail": "The answer or its authored fact statements describe the streaming response or missing-file/not-found behavior; exact HTTP status is optional.",
  },
  "linkding-asset-changed": {
    "decision-control": "The answer identifies the three read-permission alternatives and correctly denies the anonymous non-owner when public sharing is disabled.",
    "binding-effect": "It binds asset_id to the asset and its related bookmark, and places streaming after the failed bookmark gate.",
    "scenario-explanation": "It distinguishes authenticated sharing from public sharing and applies anonymous status, non-ownership, and disabled public sharing.",
    "bounded-evidence": "It keeps the result within the supplied source and declared assumptions without claiming deployed or repository-wide completeness.",
    "http-detail": "The answer or its authored fact statements describe the gate's Http404/not-found behavior before streaming; exact numeric status is optional.",
  },
  "owui-file": {
    "source-file-ownership-check": "The answer says the non-admin lookup checks the supplied file ID together with authenticated user.id.",
    "destination-is-distinct": "It distinguishes the owned source file from the independently caller-selected collection_name destination.",
    "destination-write-control-absent": "It identifies the fixed crop's lack of a collection ownership or write-grant check before the save operation.",
    "destination-reaches-insert": "It traces supplied collection_name through save_docs_to_vector_db to VECTOR_DB_CLIENT.insert on the selected collection.",
  },
  "owui-header": {
    "password-auth-entry-gate": "The answer puts ENABLE_PASSWORD_AUTH ahead of trusted-header processing and says the disabled gate blocks this path.",
    "trusted-header-configuration-gate": "It describes the environment-controlled trusted-email header name, required configuration, and required request-header presence.",
    "identity-binding": "It tracks the configured header value, lowercased into email, to the identity used for lookup/authentication.",
    "authentication-and-session-condition": "It makes session creation conditional on email authentication returning a user and says a false result cannot issue this session.",
    "deployment-facts-absent": "It names the missing effective gate values, reachable ingress, proxy header handling, and authentication outcome.",
    "conditional-capability-boundary": "It distinguishes the source-visible header-to-session capability from the unobserved real deployment outcome.",
    "password-auth-403-detail": "It explicitly states that disabling password authentication returns HTTP 403 before trusted-header handling.",
    "conditional-outcome-enumeration": "It distinguishes closed entry, failed authentication, safe trusted-proxy ingress, and client-header-reachable outcomes without asserting the deployed branch.",
    "optional-signup-path": "It states that a missing email user can pass through signup_handler before email authentication.",
    "optional-default-none-detail": "It states that the trusted-email header name defaults to no configured value when the environment does not set it.",
  },
}

const root = path.resolve(import.meta.dir, "..")
const packet = JSON.parse(await readFile(path.join(import.meta.dir, "answer-packet.json"), "utf8"))
const configBytes = await readFile(path.join(root, "panel-config.json"))
const config = JSON.parse(configBytes.toString("utf8"))
const configSha256 = createHash("sha256").update(configBytes).digest("hex")
if (!packet.generationClosed || packet.configSha256 !== configSha256 || packet.units.length !== 24) throw Error("Generation packet mismatch")
const cases = new Map(config.cases.map((item: any) => [item.id, item]))
const rubrics = new Map<string, any>()
const reviewed: Record<string, any> = {}
for (const answer of packet.units) {
  const c: any = cases.get(answer.caseId)
  if (!c || answer.status !== "completed" || !answer.rawOutputSha256) throw Error(`Incomplete ${answer.id}`)
  if (!rubrics.has(c.evaluator.path)) {
    const bytes = await readFile(path.resolve(root, "../../../../..", c.evaluator.path))
    if (createHash("sha256").update(bytes).digest("hex") !== c.evaluator.sha256) throw Error("Rubric hash changed")
    rubrics.set(c.evaluator.path, JSON.parse(bytes.toString("utf8")))
  }
  const rubric = rubrics.get(c.evaluator.path).cases.find((item: any) => item.taskId === c.taskId)
  if (!rubric) throw Error(`Missing rubric ${answer.id}`)
  const criteria: Record<string, any> = {}
  for (const criterion of rubric.criteria) {
    const reason = reasons[answer.caseId]?.[criterion.id]
    if (!reason) throw Error(`No human reason ${answer.caseId}/${criterion.id}`)
    let status = "supported", answerLocation: string | null = "/results/0"
    if (answer.caseId === "owui-header" && criterion.id === "optional-default-none-detail" && [22, 23].includes(Number(answer.id.slice(0, 2)))) {
      status = "missing"; answerLocation = null
    }
    if (answer.id.startsWith("23-") && criterion.id === "password-auth-403-detail") {
      status = "missing"; answerLocation = null
    }
    criteria[criterion.id] = { status, answerLocation, reason: status === "missing"
      ? criterion.id === "password-auth-403-detail"
        ? "This answer states that the disabled gate blocks or raises a forbidden error, but never states this route's HTTP 403 response."
        : "This answer describes configuration as potentially unset but does not state that the trusted-email header setting defaults to None."
      : reason }
  }
  const actualDecision = answer.caseId === "owui-header" ? "unknown"
    : answer.caseId === "owui-file" ? "write-reachable"
    : answer.caseId === "linkding-remove-original" || answer.caseId === "linkding-asset-changed" ? "deny" : "allow"
  reviewed[answer.id] = {
    rawOutputSha256: answer.rawOutputSha256,
    criteria,
    disposition: { status: "supported", answerLocation: "/results/0/conclusion", reason: answer.caseId === "owui-header"
      ? "Unknown is correct because application capability is visible but actual ingress, configuration, and authentication outcomes are not."
      : answer.caseId === "owui-file"
        ? "The source-visible insert path without destination authorization supports failure of the declared deny policy."
        : `The source enforces the declared ${actualDecision} expectation, so the policy-failure proposition is refuted.` },
    scope: { status: "supported", answerLocation: "/results/0/explanation", reason: "The answer limits its claim to supplied source and stated assumptions and does not assert an observed deployment outcome." },
    actualDecision,
    actualDecisionCorrect: true,
    justifiedUnknown: answer.caseId === "owui-header",
  }
}
const output = { schemaVersion: "authorization-ae-review-decisions/v1", basis: "Manual review of all 24 retained final answers after generation closure; criterion judgments bind the raw provider-output hash and frozen rubrics.", configSha256, units: reviewed }
await writeFile(path.join(import.meta.dir, "review-decisions.json"), JSON.stringify(output, null, 2) + "\n")
console.log(JSON.stringify({ reviewed: Object.keys(reviewed).length, missing: Object.values(reviewed).flatMap((u: any) => Object.values(u.criteria)).filter((c: any) => c.status === "missing").length }))
