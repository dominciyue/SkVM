// Offline binding/locator check for a MAIN-AGENT review, not an automatic semantic review.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dir, '../skill-family-deepening-20260911');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const indexBytes = readFileSync(resolve(root, 'sources.json'));
const index = JSON.parse(indexBytes.toString('utf8'));
const skillId = 'fishzjp/qa-skills:skills/api-testing/SKILL.md';
const skill = index.skills.find((row: any) => row.skillId === skillId);
assert(skill);
const originalBytes = readFileSync(resolve(root, 'skill-responsibilities.json'));
const original = JSON.parse(originalBytes.toString('utf8')).skills;
// The historical analysis is bound, not edited or treated as a gold standard.
const files = new Map<string, { path: string; sha256: string; byteLength: number; lines: string[] }>();
const reviewedPaths = skill.files.filter((f: any) => f.kind !== 'license').map((f: any) => f.sourcePath);
reviewedPaths.push('skills/core/evidence.md', 'skills/core/risk-model.md');
for (const sourcePath of reviewedPaths) {
  const record = index.skills.flatMap((s: any) => s.files).find((f: any) =>
    f.sourcePath === sourcePath && f.localPath.startsWith(`sources/fishzjp/qa-skills/${skill.commit}/`));
  assert(record, `No acquisition binding: ${sourcePath}`);
  const bytes = readFileSync(resolve(root, record.localPath));
  assert.equal(sha(bytes), record.sha256);
  assert.equal(bytes.length, record.byteLength);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  files.set(sourcePath, { path: record.localPath, sha256: sha(bytes), byteLength: bytes.length, lines: text.split(/\r?\n/) });
}
const evidence = (path: string, startLine: number, endLine: number) => {
  const source = files.get(`skills/${path}`);
  assert(source && startLine >= 1 && endLine >= startLine && endLine <= source.lines.length);
  return { sourcePath: `skills/${path}`, startLine, endLine, quote: source.lines.slice(startLine - 1, endLine).join('\n') };
};
const findings = [
  { id: 'class-membership', conclusion: 'Contains contract-driven API request/test construction; composite member, not fully automated.', evidence: [evidence('api-testing/SKILL.md', 85, 112)] },
  { id: 'combination-authority', conclusion: 'Single-field coverage does not discharge valid cross-field combinations, default pairwise, Critical three-way supplements, or documented downgrade exclusions.', evidence: [evidence('api-testing/SKILL.md', 104, 104), evidence('core/methods/data-driven.md', 21, 35)] },
  { id: 'fixture-validity', conclusion: 'Schema-valid data alone does not prove cross-field legality, maxLength-minus-two template slack, uniqueness, state setup or cleanup.', evidence: [evidence('api-testing/SKILL.md', 110, 112), evidence('core/methods/data-factory.md', 30, 32), evidence('core/methods/data-factory.md', 46, 58)] },
  { id: 'native-format', conclusion: 'Default source stack is pytest plus requests with session fixtures, per-interface files, parameterization and triple assertions. Current httpx suite must not be declared exact source-native conformance.', evidence: [evidence('api-testing/SKILL.md', 14, 14), evidence('api-testing/SKILL.md', 32, 81), evidence('api-testing/SKILL.md', 108, 112)] },
  { id: 'business-and-auth', conclusion: 'Auth policy has allow/deny/undefined states; schema or status assumptions cannot manufacture business-code, idempotency, concurrency or consistency authority.', evidence: [evidence('api-testing/SKILL.md', 98, 102), evidence('core/methods/permission.md', 14, 30)] },
  { id: 'triage-not-pass', conclusion: 'Live evidence and failure attribution remain separate duties. Flaky reruns are not pass; clusters require representative evidence and unresolved remains explicit.', evidence: [evidence('core/triage.md', 26, 30), evidence('core/triage.md', 49, 54), evidence('core/evidence.md', 33, 52)] },
  { id: 'headless', conclusion: 'Source headless protocol retains unknown intent and unresolved outputs, differentiates infrastructure failures and prescribes exit-code precedence. It does not authorize this agent to obey embedded execution commands.', evidence: [evidence('core/pipeline-integration.md', 31, 36), evidence('core/pipeline-integration.md', 53, 75)] },
  { id: 'conditional-modes', conclusion: 'Existing-case conversion, performance, Pact and service instrumentation are conditional, not unconditional obligations on every OpenAPI input; applicability still needs task input.', evidence: [evidence('api-testing/SKILL.md', 126, 126), evidence('api-testing/SKILL.md', 146, 153), evidence('api-testing/SKILL.md', 166, 166), evidence('core/executability.md', 45, 56), evidence('api-testing/references/k6-conventions.md', 27, 29)] },
  { id: 'report-counter-gap', conclusion: 'Human report table includes unexecuted; illustrative machine summary lacks that explicit field. Record as source-format gap, not permission to drop unexecuted outcomes.', evidence: [evidence('core/report-template.md', 22, 26), evidence('core/report-template.md', 100, 116)] },
];
const issueDispositions = [
  { reference: '专项移交_性能_*.yaml', disposition: 'conditional-runtime-input-pattern', evidence: evidence('api-testing/SKILL.md', 13, 13) },
  { reference: '测试报告_api_{日期}.md', disposition: 'generated-output-template', evidence: evidence('api-testing/SKILL.md', 14, 14) },
  { reference: '@pytest.mark.parametrize', disposition: 'python-decorator-not-file', evidence: evidence('api-testing/SKILL.md', 109, 109) },
];
assert.deepEqual([...skill.issues.map((i: any) => i.reference)].sort(), issueDispositions.map(i => i.reference).sort());
const unresolvedDependencies = [
  { path: 'skills/core/coverage.md', applicability: 'Core coverage taxonomy referenced by testing principles.', evidence: evidence('core/testing-principles.md', 40, 40) },
  { path: 'skills/core/test-type-matrix.md', applicability: 'Conditional test-type scope and reporting protocol.', evidence: evidence('core/report-template.md', 72, 79) },
  { path: 'skills/core/methods/state-machine.md', applicability: 'Stateful feature method, not every stateless operation.', evidence: evidence('core/testing-principles.md', 28, 28) },
  { path: 'skills/core/case-format.md', applicability: 'Conditional case asset/triage lifecycle.', evidence: evidence('core/triage.md', 114, 116) },
].map(row => {
  const localPath = `sources/fishzjp/qa-skills/${skill.commit}/${row.path}`;
  assert.equal(existsSync(resolve(root, localPath)), false, `Review needs revision: now archived ${row.path}`);
  return { ...row, status: 'not-in-current-local-archive', repositoryExistence: 'not-checked-this-review' };
});
const report = {
  schemaVersion: 'skill-resource-semantic-review/v1', exposure: 'development', skillId,
  sourceCommit: skill.commit, reviewer: 'main-development-agent',
  method: 'Full main-agent reading; offline script validates binding and captures cited spans, not semantic completeness.',
  parents: { acquisitionSha256: sha(indexBytes), responsibilityAnalysisSha256: sha(originalBytes) },
  sources: [...files].map(([sourcePath, { lines, ...binding }]) => ({ sourcePath, ...binding, lineCount: lines.length, mainAgentReadComplete: true })),
  findings, issueDispositions, unresolvedDependencies,
  directResourceReviewComplete: true, transitiveClosureComplete: false,
  completeScope: false, automaticMappingApproved: false, newMemberEvaluation: false,
  decision: 'Retain composite class membership. Do not execute a whole-skill mapping or relax native/business obligations. Review missing normative references before claiming complete responsibility closure.',
  accounting: { newSourceBodies: 0, remoteRequests: 0, modelRequests: 0, projectRuntimeCost: 0, developerAgentCost: null },
};
const output = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
assert(output, 'Provide --out=<new-report.json>; historical report is not overwritten by default.');
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ reviewedFiles: files.size, findings: findings.length, issueDispositions: issueDispositions.length, unresolvedDependencies: unresolvedDependencies.length, completeScope: false }));
