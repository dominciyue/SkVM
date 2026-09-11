import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = dirname(fileURLToPath(import.meta.url));
const sha = b => createHash('sha256').update(b).digest('hex');
const bytes = readFileSync(resolve(root, 'acquisition.json'));
const acquisition = JSON.parse(bytes);
assert.equal(acquisition.rows.length, 4);
const texts = new Map();
for (const row of acquisition.rows) {
  assert.equal(row.status, 200);
  const content = readFileSync(resolve(root, row.localPath));
  assert.equal(sha(content), row.sha256);
  assert.equal(content.length, row.byteLength);
  texts.set(row.path.replace('skills/core/', ''), new TextDecoder('utf-8', { fatal: true }).decode(content).split(/\r?\n/));
}
const cite = (file, startLine, endLine) => {
  const lines = texts.get(file);
  assert(lines && startLine > 0 && endLine >= startLine && endLine <= lines.length);
  return { file, startLine, endLine, quote: lines.slice(startLine - 1, endLine).join('\n') };
};
const findings = [
  { id: 'consumer-specific-coverage', finding: 'Do not apply all19 dimensions mechanically: writing and independent review differ; source-code review is conditional on available code. Type inclusion authority is the type matrix.', evidence: [cite('coverage.md', 7, 18), cite('coverage.md', 168, 177)] },
  { id: 'separate-strategy-authority', finding: 'Ten-axis strategy is upstream input, not inferred from an OpenAPI schema. No-code exclusion explicitly lowers confidence. Full conformance of type_scope requires the referenced validator, not this prose alone.', evidence: [cite('test-type-matrix.md', 3, 3), cite('test-type-matrix.md', 17, 23)] },
  { id: 'no-double-count', finding: 'Permission and security, concurrency and performance, functional negatives and contract differences retain separate decisions without double-counting the same cases. Shared execution can supply evidence to distinct duties.', evidence: [cite('test-type-matrix.md', 25, 31)] },
  { id: 'environment-does-not-erase-duty', finding: 'Unavailable environment/data/tools changes execution_status to blocked, not the required depth. Native collection/skips cannot discharge execution obligations.', evidence: [cite('test-type-matrix.md', 154, 165)] },
  { id: 'schema-not-full-integration', finding: 'Standard integration specifies mock AND real execution; full specifies consumer contracts plus dependency faults. Existing schema/example checks alone do not satisfy either.', evidence: [cite('test-type-matrix.md', 128, 146)] },
  { id: 'state-machine-needs-authority', finding: 'Each edge needs source authority and guards, then illegal/concurrent/reverse-edge cases. Do not invent state machines for stateless validation/query/conversion.', evidence: [cite('methods/state-machine.md', 7, 17), cite('methods/state-machine.md', 28, 41)] },
  { id: 'case-format-is-mode-specific', finding: 'Human case-writing/review format has unique TC IDs, reader-facing steps and separate code evidence appendix; it is not an unconditional formatting requirement for a generated Python module.', evidence: [cite('case-format.md', 3, 3), cite('case-format.md', 29, 34), cite('case-format.md', 65, 72), cite('case-format.md', 102, 119)] },
];
const parent = readFileSync(resolve(root, '../skill-family-fishzjp-review-20260911/report.json'));
const report = {
  schemaVersion: 'skill-resource-closure-review/v1', exposure: 'development',
  acquisitionSha256: sha(bytes), parentReviewSha256: sha(parent),
  reviewer: 'main-development-agent', fullReadFiles: 4,
  method: 'Full main-agent reading; this script checks source bytes and captures locators, not semantic truth.',
  findings,
  closure: { previousFourReferences: 'acquired-and-reviewed', globalTransitiveClosureComplete: false,
    remaining: [
      { reference: 'skills/core/scripts/validate_schema.py', role: 'Authoritative type_scope schema/V1-V5 checks', status: 'not-acquired-this-stage', applicableWhen: 'Claiming upstream strategy/schema validation', evidence: cite('test-type-matrix.md', 3, 3) },
      { reference: 'skills/core/scripts/scan_signals.py', role: 'Code-mode G signal extraction', status: 'not-acquired-this-stage', applicableWhen: 'Code-backed test strategy; not source-only OpenAPI construction', evidence: cite('test-type-matrix.md', 17, 21) },
      { reference: 'test-strategy/test-case-writing/test-case-review sibling skills and templates', role: 'Upstream strategy and human case workflows', status: 'outside-current-bounded-review', applicableWhen: 'Executing those workflows, not merely classifying API skill membership' }
    ] },
  decision: 'Keep composite membership; classify obligations by input mode and authority without dropping unresolved duties. No whole-skill approval, no new transfer evaluation, no source-specific success branch.',
  completeScope: false, automaticMappingApproved: false,
  accounting: { publicResourceRequests: 4, newPrimaryBodies: 0, modelCalls: 0, businessApiCalls: 0, developerAgentCost: null }
};
const output = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
assert(output, 'Pass --out=<new-report.json>');
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ boundSources: texts.size, findings: findings.length, completeScope: false }));
