<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task synthetic-record-archive, expressed with source-authorization-assessment/v0. May an authenticated support agent who is not the owner or a supervisor archive this record?
Assess repository https://example.test/synthetic/records at source ref synthetic-v1 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:archive is a explicit-task-requirement at authoring-v2.json#/policies/archive, revision synthetic-policy-v1.
  Policy text: Only the record owner or a supervisor may archive a record.
  Acceptance is accepted; accepting actor role: task-author; reason: The synthetic task author controls this bounded requirement.

The principals are:
- principal:support has role support agent. Author facts: ["Not a supervisor"]
  Starting capabilities: authenticated, support-agent.

The resources are:
- resource:record is a record. Author facts: ["Existing customer record owned by another principal"]

The declared source entries are:
- entry:archive names archiveRecord.
  Source location: src/record.ts, startLine 11, endLine 16.

The authorization obligations are:
- scenario:archive: principal principal:support, resource resource:record, relation different-owner-without-supervisor-role, operation archive, expected policy disposition deny.
  Policy source: policy:archive. Declared entries: entry:archive.
  Conditions: none declared.
- scenario:second: principal principal:support, resource resource:record, relation different-owner-without-supervisor-role, operation archive, expected policy disposition deny.
  Policy source: policy:archive. Declared entries: entry:archive.
  Conditions: none declared.

Scope assurance: Only explicitly declared scenarios and supplied source are assessed; repository discovery and deployment behavior are not tested.
Required analysis:
- Trace entry, identity and resource binding, strongest authorization control, and protected effect. Explain decisive missing source-external facts.
Constraints:
- Use only supplied fixed source context. Do not execute or modify the target, contact a deployment, or claim repository-wide discovery.
Allowed conclusions: source_supported_failure, source_refuted, unknown.

## Public analysis questions
- Which source-visible condition or control gates the declared entry before the assessed path proceeds?
- How is the declared principal bound to the runtime caller or identity used by the assessed operation?
- How is the request-selected object bound to the declared resource, and which other checked resource must remain distinct?
- What is the strongest source-visible authorization decision for this principal, resource relation, operation, and condition set, including any role or ownership branch?
- After the visible controls, can the requested operation reach the declared protected effect, and under which source-visible branch?
- Which source-external fact, if any, can change the answer, and is that fact supplied or still unknown in this fixed context?

## Result contract
Use compact wire/v4: top-level results only. Each item has obligationId, conclusion, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation, with one of: source_supported_failure, source_refuted, unknown.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
- scenario%3Aarchive::entry%3Aarchive
- scenario%3Asecond::entry%3Aarchive
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: src/record.ts =====
Source ID: src-a502ab729f6f35ec
Location note: crop lines 1-16; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | export interface Principal {
2 |   id: string
3 |   roles: string[]
4 | }
5 | 
6 | export interface RecordRow {
7 |   ownerId: string
8 |   archived: boolean
9 | }
10 | 
11 | export async function archiveRecord(principal: Principal, record: RecordRow): Promise<RecordRow> {
12 |   const mayArchive = record.ownerId === principal.id || principal.roles.includes("supervisor")
13 |   if (!mayArchive) throw new Error("archive denied")
14 |   record.archived = true
15 |   return record
16 | }
===== END ALLOWED INPUT: src/record.ts =====
