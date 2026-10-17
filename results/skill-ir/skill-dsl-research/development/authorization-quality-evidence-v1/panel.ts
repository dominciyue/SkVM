export const domains = ["object-relations", "branch-call-order", "change-consistency", "conditions-evidence"] as const
export const profiles = ["root-default", "empty-version", "root-fallback", "denied", "anonymous-skip-checker", "no-external"] as const
export const arms = ["R0", "R1", "R2"] as const
export const panelOrder = [0, 1].flatMap(repeat => profiles.flatMap((_, q) => {
  const order = [...arms.slice(q % 3), ...arms.slice(0, q % 3)]
  return (repeat ? order.reverse() : order).map(arm => `Q${q}-${arm}-${repeat}`)
}))
export const positions = ["A0", "A1", "A2", ...panelOrder, "S-R1", "S-R2", "T-A0", "T-R0", "T-R1", "T-R2"]
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export function positionOptions(position: string) {
  if (!positions.includes(position)) throw new Error("Unknown BP purpose")
  const author = ["A0", "A1", "A2", "S-R1", "S-R2", "T-A0"].includes(position), baseline = /(^|-)R0($|-)/.test(position)
  const q = /^Q([0-5])-/.exec(position)
  return { author, baseline, programSupport: (position.includes("R1") ? "rules" : "execute") as "rules" | "execute", variant: position.startsWith("T-") ? "sharelink" : position.startsWith("S-") ? "source-change" : q ? profiles[Number(q[1])]! : "root-default" }
}
const fact = (id: string, domain: typeof domains[number], question: number, essential: boolean, criterion: string, source: string) => ({ id, domain, question, essential, criterion, source })
export const rubric = {
  schemaVersion: "authorization-quality-rubric/v1", frozenBeforeAuthors: true, domains,
  semantics: "Human source-grounded review, never keyword scoring. Each label requires answer quote/location and source rationale; omissions identify the missing criterion. No credit solely because the source or raw program contains a fact. Current scenario facts supplement, never erase, the original four questions. Across-profile consistency uses the existing six answers only.",
  labels: ["correct", "omitted", "incorrect", "appropriately-unknown", "over-abstained", "undelivered"],
  questions: ["requested-document-and-returned-file", "authorization-and-selection-order", "alternate-version-authorized-resource", "missing-facts-and-conditional-conclusions"],
  questionScoring: "full requires all relevant essential facts with no material contradiction; partial retains supported substance with omissions; incorrect contains a material false affirmation. Whole full requires four full questions and mutually consistent scope. Undelivered is recorded separately, never excluded.",
  unknownRule: "appropriately-unknown requires the exact missing decisive fact and the conclusion it blocks; unknown for source-visible relations is over-abstained. Optional facts are reported but excluded from essential error/omission comparisons.",
  facts: [
    fact("O1", "object-relations", 1, true, "Request pk selects request_doc with global_objects in file_response; absent document is 404. This direct lookup is distinct from a generic get_object call.", "views.py:1401-1415,1429-1434"),
    fact("O2", "object-relations", 3, true, "Root resolution returns self for root; otherwise related root, query fallback, then self. view_document is evaluated on that resolved root, not the eventual file/version.", "versioning.py:146-156; views.py:1417-1427"),
    fact("O3", "object-relations", 3, true, "Requested document, authorization root and effective file document can differ; choosing a version/representation does not introduce a second object check on the selected file in this path.", "views.py:1388-1448"),
    fact("O4", "object-relations", 1, false, "serve_file uses selected doc archive_file or source_file and constructs FileResponse/disposition; file materialization remains separate from permission evidence.", "views.py:4941-4995"),
    fact("B1", "branch-call-order", 2, true, "Framework authentication and configured permission checks occur before action; this custom lookup does not automatically invoke generic get_object/check_object_permissions. Explain evidence rather than assuming either hook executed.", "views.py:1021,1834-1836; framework/views.py:404-421,509-523; permissions.py:30-53"),
    fact("B2", "branch-call-order", 2, true, "Outer request.user is not None gates the owner-aware helper. Inside it ObjectPermissionChecker is constructed before owner-null/owner-equality short circuit; only nonowner reaches has_perm.", "views.py:1421-1426; permissions.py:624-635"),
    fact("B3", "branch-call-order", 2, true, "Failed owner-aware check yields Forbidden before effective version/representation selection or serve_file; no invented later calls on denial.", "views.py:1421-1448"),
    fact("B4", "branch-call-order", 1, true, "Absent version and empty string differ: requested child plus absent version returns child directly; otherwise resolver runs. Presence controls include_deleted, while falsey parameter selects latest.", "views.py:1375-1399; versioning.py:169-182"),
    fact("B5", "branch-call-order", 1, true, "Explicit nonempty version is int-parsed; conversion failure, missing candidate and foreign-root candidate reject. Candidate must be root itself or belong to resolved root.", "versioning.py:184-195; views.py:1382-1386"),
    fact("B6", "branch-call-order", 1, true, "Latest uses version_index DESC NULLS LAST then id DESC, manager depends on include_deleted, no candidate falls back to root. Do not omit deleted filtering or substitute maximum id.", "versioning.py:23-28,136-137,159-166; views.py:1375-1381"),
    fact("B7", "branch-call-order", 1, true, "Only exact original=true requests original; otherwise use archive iff selected file has archive, else source. Distinguish this from version selection and authorization.", "views.py:1368-1373,1442-1448,4948-4965"),
    fact("B8", "branch-call-order", 1, false, "Response filename/disposition and content type follow selected representation; formatting affects filename rather than permission resource.", "views.py:1446-1447,4952-4995"),
    fact("C1", "change-consistency", 1, true, "Current profile's finite request/root/file/representation or refusal/conditional result agrees with supplied facts and source. Cross-profile Q0/Q1 change is explained using absent/empty and deleted visibility, not a changed grant.", "profile-specific expected facts in evaluation/profile-expectations.json; views.py:1375-1448"),
    fact("C2", "change-consistency", 3, true, "Version/original changes preserve resolved authorization object for same request/root facts; a root fallback can change the object because root lookup changed. Explain concrete current profile and general source relation.", "versioning.py:146-156; views.py:1417-1448"),
    fact("C3", "change-consistency", 2, true, "Profiles Q3/Q4/Q5 differ by explicit false, local None actor, and missing external facts: reject, skip local checker, and condition respectively. Do not carry default permission or computed file into a changed case.", "views.py:1421-1436; permissions.py:634-635; supplied facts"),
    fact("C4", "change-consistency", 3, false, "The source reasoning distinguishes a changed input from a changed rule; untriggered branches remain relevant to the original all-branches question.", "original questions1/3; views.py:1375-1448"),
    fact("E1", "conditions-evidence", 4, true, "Finite local-entry facts do not prove real HTTP admission, authentication/backend configuration or global permissions. Q4 None actor is hypothetical local reachability, not an anonymous endpoint bypass.", "framework/views.py:404-421; views.py:1021; profile Q4 scope note"),
    fact("E2", "conditions-evidence", 4, true, "Normal constructor completion is not a grant; false/None return may still mean completion. Owner shortcut does not erase constructor; missing has_perm/constructor evidence blocks only the dependent local continuation.", "permissions.py:634-635; supplied external assumptions"),
    fact("E3", "conditions-evidence", 4, true, "Source-supported rules, hypothetical execution, author literal claims and actual deployment facts are distinguished. No assertion that DSL checked literal or source coverage proves all request behavior.", "original question4; source boundary; actual program basis when present"),
    fact("E4", "conditions-evidence", 4, true, "Name missing ownership/grant or upstream facts precisely and their blocked conclusions; use provided finite facts for local reasoning. Do not blanket-abstain on source-visible selection and authorization relations.", "original questions2-4; supplied finite inputs"),
    fact("E5", "conditions-evidence", 4, false, "Actual database consistency, file existence/storage success and deployed configuration are not established by finite records or FileResponse construction alone.", "versioning.py:154-156; views.py:4941-4995"),
  ],
  advantage: "For a domain R2 must have fewer essential incorrect+omitted+over-abstained+undelivered than R1 in EACH repeat, with no increase in essential incorrect in either repeat. All four domain matrices and every planned first position are mandatory; secondary repairs never replace them.",
}
type Review = { position: string; delivery: string; facts: Array<{ id: string; label: string; evidence: string }>; questions: string[]; wholeAnswer: string; answer: string }
export function validateReview(row: Review) {
  if (!panelOrder.includes(row.position)) throw new Error("Unknown primary review")
  if (!row.answer || !["delivered", "undelivered"].includes(row.delivery)) throw new Error("Missing answer pointer/delivery")
  if (row.delivery === "delivered" && row.facts.some(f => f.label === "undelivered")) throw new Error("Inconsistent delivery labels")
  if (row.facts.length !== rubric.facts.length || new Set(row.facts.map(f => f.id)).size !== rubric.facts.length || rubric.facts.some(f => !row.facts.some(r => r.id === f.id))) throw new Error("Incomplete fact coverage")
  for (const f of row.facts) if (!rubric.labels.includes(f.label) || !f.evidence.trim() || row.delivery === "undelivered" && f.label !== "undelivered") throw new Error("Invalid review label/evidence")
  if (row.questions.length !== 4 || [...row.questions, row.wholeAnswer].some(q => !["full", "partial", "incorrect"].includes(q))) throw new Error("Incomplete question scores")
  if (row.wholeAnswer === "full" && (row.delivery !== "delivered" || row.questions.some(q => q !== "full"))) throw new Error("Inconsistent whole answer score")
  return true
}
export function summarizeQuality(rows: Review[], sourceEpochs?: Record<string, string | undefined>) {
  if (rows.length !== 36 || new Set(rows.map(r => r.position)).size !== 36 || panelOrder.some(p => !rows.some(r => r.position === p))) throw new Error("Primary denominator must retain all 36 first positions")
  rows.forEach(validateReview)
  const counts = (row: Review, domain: string) => {
    const relevant = row.facts.filter(f => rubric.facts.find(r => r.id === f.id)!.domain === domain), essential = relevant.filter(f => rubric.facts.find(r => r.id === f.id)!.essential)
    return { labels: Object.fromEntries(rubric.labels.map(label => [label, relevant.filter(f => f.label === label).length])), essentialIncorrect: essential.filter(f => f.label === "incorrect").length, essentialLoss: essential.filter(f => ["incorrect", "omitted", "over-abstained", "undelivered"].includes(f.label)).length }
  }
  const matrix = Object.fromEntries(domains.map(domain => {
    const comparisons = Object.fromEntries([["R1", "R0"], ["R2", "R1"], ["R2", "R0"]].map(([treatment, control]) => {
      const pairs = [0, 1].flatMap(repeat => profiles.map((_, q) => {
        const a = rows.find(r => r.position === `Q${q}-${treatment}-${repeat}`)!, b = rows.find(r => r.position === `Q${q}-${control}-${repeat}`)!, x = counts(a, domain), y = counts(b, domain)
        const descriptiveResult = x.essentialLoss < y.essentialLoss && x.essentialIncorrect <= y.essentialIncorrect ? "win" : x.essentialLoss === y.essentialLoss && x.essentialIncorrect === y.essentialIncorrect ? "tie" : "loss"
        const eligible = !sourceEpochs || !!sourceEpochs[a.position] && sourceEpochs[a.position] === sourceEpochs[b.position]
        return { profile: `Q${q}`, repeat, treatment: x, control: y, result: eligible ? descriptiveResult : "unpaired", descriptiveResult, causalComparisonEligible: eligible, reason: eligible ? undefined : sourceEpochs?.[a.position] && sourceEpochs?.[b.position] ? "implementation-epoch-mismatch" : "implementation-epoch-unavailable", answers: [a.answer, b.answer] }
      }))
      const repeats = [0, 1].map(repeat => { const p = pairs.filter(p => p.repeat === repeat); return { repeat, plannedPairs: p.length, eligiblePairs: p.filter(p => p.causalComparisonEligible).length, treatmentLoss: p.reduce((n, p) => n + p.treatment.essentialLoss, 0), controlLoss: p.reduce((n, p) => n + p.control.essentialLoss, 0), treatmentIncorrect: p.reduce((n, p) => n + p.treatment.essentialIncorrect, 0), controlIncorrect: p.reduce((n, p) => n + p.control.essentialIncorrect, 0) } })
      return [`${treatment}-${control}`, { pairs, repeats, win: pairs.filter(p => p.result === "win").length, tie: pairs.filter(p => p.result === "tie").length, loss: pairs.filter(p => p.result === "loss").length, unpaired: pairs.filter(p => p.result === "unpaired").length }]
    }))
    const repeats = comparisons["R2-R1"]!.repeats, wins = repeats.filter(r => r.treatmentLoss < r.controlLoss && r.treatmentIncorrect <= r.controlIncorrect).length
    return [domain, { comparisons, qualityEvidenceStatus: repeats.some(r => r.eligiblePairs !== r.plannedPairs) ? "incomplete-pairing" : wins === 2 ? "repeated-local-advantage" : wins ? "exploratory-improvement-or-tradeoff" : repeats.every(r => r.treatmentLoss === r.controlLoss && r.treatmentIncorrect === r.controlIncorrect) ? "tie" : "negative-or-tradeoff" }]
  }))
  return { primaryDenominator: 36, domains: matrix, localQualityGoalAchieved: Object.values(matrix).some(d => d.qualityEvidenceStatus === "repeated-local-advantage"), delivered: rows.filter(r => r.delivery === "delivered").length, wholeFull: rows.filter(r => r.delivery === "delivered" && r.wholeAnswer === "full").length, rows, researchGoalAchieved: false }
}
