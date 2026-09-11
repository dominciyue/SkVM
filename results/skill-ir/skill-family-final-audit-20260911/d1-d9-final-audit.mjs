import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const read = relative => JSON.parse(readFileSync(resolve(repo, relative), 'utf8'));
const sha = relative => createHash('sha256').update(readFileSync(resolve(repo, relative))).digest('hex');
const git = (...args) => execFileSync('git', ['-c', 'safe.directory=D:/skill优化/SkVM', ...args], { cwd: repo, encoding: 'utf8' }).trim();
const source = read('results/skill-ir/skill-family-deepening-20260911/sources.json');
const responsibilities = read('results/skill-ir/skill-family-deepening-20260911/skill-responsibilities.json');
const baseline = read('results/skill-ir/skill-family-deepening-20260911/baseline-v2/report.json');
const inputs = read('results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json');
const automation = read('results/skill-ir/skill-family-deepening-20260911/automation-measurement.json');
const newMemberOutcome = read('results/skill-ir/skill-family-new-members-20260911-r5/outcome.json');
const method = read('results/skill-ir/skill-family-new-members-20260911-r5/method-binding.json');
const revision = read('results/skill-ir/skill-family-new-members-20260911-r5/mapping-revision.json');
const verification = read('results/skill-ir/skill-family-final-audit-20260911/verification-current-20260911.json');
const history = read('results/skill-ir/skill-family-final-audit-20260911/history-r1.json');

const evidencePaths = [
  'results/skill-ir/skill-family-request-specimens-development-20260911',
  'results/skill-ir/skill-family-body-negatives-development-20260911',
  'results/skill-ir/skill-family-composition-development-20260911',
  'results/skill-ir/skill-family-form-development-20260911',
  'results/skill-ir/skill-family-decimal-development-20260911',
  'results/skill-ir/skill-family-response-schema-development-20260911',
  'results/skill-ir/skill-family-response-headers-development-20260911',
  'results/skill-ir/skill-family-native-wire-development-20260911',
  'results/skill-ir/skill-family-current-clean-20260911',
];
for (const path of evidencePaths) assert(existsSync(resolve(repo, path)), `missing evidence: ${path}`);
assert.equal(source.skills.length, 31);
assert.equal(responsibilities.acquiredSkillCount, 31);
assert.equal(responsibilities.reviewedBodyCount, 7);
assert.equal(baseline.inputDocuments, 12);
assert.equal(baseline.uniqueProviders, 6);
assert.equal(baseline.plannedSkillInputTasks, 36);
assert.equal(inputs.inputs.length, 12);
assert.equal(method.newBodiesReadBeforeBinding, 0);
assert.equal(method.prospective, false);
assert.equal(revision.coreChanges, 0);
assert.equal(verification.focusedRegression.failed, 0);
assert.equal(verification.mainTypecheck.exitCode, 0);
assert.equal(verification.scriptTypecheck.exitCode, 0);
assert.equal(history.differences.filter(x => x.path.startsWith('/skills/')).length, 3);

const processedRepositories = source.repositories.filter(row => row.status === 'processed').length;
const failedRepositories = source.repositories.filter(row => row.status !== 'processed').length;
const reviewedResponsibilities = responsibilities.skills.reduce((sum, row) => sum + row.responsibilities.length, 0);
const firstRun = newMemberOutcome.rows.filter(row => row.run === 'first-run');
const repaired = newMemberOutcome.rows.filter(row => row.run === 'mapping-repair-run');
const repairPasses = repaired.filter(row => row.error === null && row.tasks === 12 && row.checksPassed === 12).length;
const allMappingProfiles = ['lambda', 'jeremy', 'pactflow'].map(id => read(`results/skill-ir/skill-family-deepening-20260911/baseline-v2/${id}-mapping.json`));
const sharedProfile = new Set(allMappingProfiles.map(row => row.profile));
const sharedAnalysisPaths = new Set(allMappingProfiles.map(row => row.analysisPath));
const sharedResponsibilityIds = new Set(allMappingProfiles.map(row => row.responsibilityId));

const stages = [
  { id: 'D1', status: 'complete-bounded', evidence: ['sources.json', 'acquisition.jsonl', 'skill-family-deepening-20260911'], metrics: { acquiredBodies: 31, processedRepositories, failedRepositories, sourceRecords: 161 }, limits: ['Only7 bodies deeply reviewed; remaining acquired skills stay unclassified.', 'Repository/source genealogy is not proved by acquisition metadata.'] },
  { id: 'D2', status: 'complete-bounded', evidence: ['skill-responsibilities.json', 'family-contract.md', 'skill-family-fishzjp-review-20260911', 'skill-family-fishzjp-closure-20260911'], metrics: { reviewedBodies: 7, reviewedResponsibilities, candidateClass: 'API contract-driven offline test construction' }, limits: ['Composite skill residual duties and unresolved semantic authority remain explicit.', 'No independent human agreement is claimed.'] },
  { id: 'D3', status: 'complete-bounded', evidence: ['baseline-v2/*-mapping.json', 'src/skill-ir/api-skill-mapping.ts'], metrics: { mappedMembers: 3, sharedProfiles: [...sharedProfile], sharedAnalysisPaths: [...sharedAnalysisPaths], sharedResponsibilityIds: [...sharedResponsibilityIds], repositorySpecificBranches: 0 }, limits: ['Mapping is agent-reviewed declaration, not automatic natural-language compilation.', 'Native/live/original output duties remain outside the bounded profile.'] },
  { id: 'D4', status: 'complete-bounded', evidence: ['baseline-v2/report.json', 'api-inputs/inputs.json'], metrics: { inputDocuments: baseline.inputDocuments, providers: baseline.uniqueProviders, plannedMemberInputTasks: baseline.plannedSkillInputTasks, memberOperationRows: 909, acceptedRows: 24, rejectedRows: 885 }, limits: ['The12 API documents come from one aggregator repository and are reused across members.', 'No live business correctness or credential-backed status oracle.'] },
  { id: 'D5', status: 'complete-bounded', evidence: evidencePaths.slice(0, 8), metrics: { sharedCapabilities: ['nested/composition schema witnesses', 'source-bound request/body/form/wire construction', 'response/header observation and independent checking', 'decimal constraint oracle'], independentCheckerRegression: true }, limits: ['The implemented contract is a bounded slice; source-native and business obligations remain unresolved.', 'Synthetic and source-example evidence is not production API evidence.'] },
  { id: 'D6', status: 'complete-bounded', evidence: ['automation-measurement.json', 'skill-duty-extraction-development-20260911'], metrics: { matchedTasks: automation.modelComparison.matchedTasks, independentOperations: automation.modelComparison.independentApiOperations, skillContexts: automation.modelComparison.skillContexts, deterministicPassed: automation.modelComparison.deterministicPassed, modelPassed: automation.modelComparison.modelPassed, httpAttempts: automation.modelComparison.httpAttempts, inputTokens: automation.modelComparison.inputTokens, outputTokens: automation.modelComparison.outputTokens, extractionRemoteRequests: 3 }, limits: automation.remainingMeasurementGaps },
  { id: 'D7', status: 'complete-bounded', evidence: ['skill-family-new-members-20260911-r5/method-binding.json', 'outcome.json', 'mapping-revision.json', 'skill-family-origin-metadata-20260911'], metrics: { newMappedMembers: 4, firstRunMembers: firstRun.length, firstRunErrors: firstRun.filter(row => row.error !== null).length, repairPasses, coreChangesDuringRepair: revision.coreChanges, prospective: method.prospective }, limits: ['Three members required metadata repair before execution; first-run failures remain preserved.', 'Non-fork metadata and lexical checks do not prove complete genealogy independence.', 'All full-skill/native output claims remain false.'] },
  { id: 'D8', status: 'complete-bounded', evidence: ['skill-family-current-clean-20260911/clean-archive-r1', 'skill-family-response-headers-development-20260911/clean-e9d6dde-r1', 'verification-current-20260911.json'], metrics: { cacheHits: 2405, cacheCompiles: 109, latestCleanCandidate: verification.cleanEvidenceScope.latestFullCleanCandidate, cleanArchivedFiles: verification.cleanEvidenceScope.archivedFiles, cleanSemanticComparisons: verification.cleanEvidenceScope.semanticComparisons, focusedRegressionPasses: verification.focusedRegression.passed }, limits: ['Full clean archive precedes later duty-extraction/docs-only commits; current-head additions have focused fresh regression, not an implicit clean claim.', 'All native panel cases are skipped because live oracles are absent.'] },
  { id: 'D9', status: 'complete-bounded', evidence: ['skill-family-current-results.md', 'deadline-execution-status.md', 'project_handoff.md', 'verification-current-20260911.json'], metrics: { currentCommit: git('rev-parse', 'HEAD'), originCommit: git('rev-parse', 'origin/api-tester-operation-unseen-prospective-001'), focusedRegression: verification.focusedRegression, mainTypecheck: verification.mainTypecheck, scriptTypecheck: verification.scriptTypecheck }, limits: ['Development branch remains unmerged; historical/frozen inputs and reports are preserved.', 'No prospective selection or readiness conclusion is made.'] },
];

const output = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
assert(output, 'Pass --out=<new-report.json>');
const report = {
  schemaVersion: 'skill-family-d1-d9-final-audit/v1', exposure: 'development',
  auditedHead: git('rev-parse', 'HEAD'), auditedAt: new Date().toISOString(),
  class: { name: 'API contract-driven offline test construction', independentOfCurrentSupport: true, wholeSkillComplete: false },
  stages, verificationSha256: sha('results/skill-ir/skill-family-final-audit-20260911/verification-current-20260911.json'),
  evidencePaths, protectedBoundary: verification.protectedBoundary,
  accounting: { modelCallsThisAudit: 0, paidCallsThisAudit: 0, developerAgentCost: 'not-measured', historicalCosts: 'preserved as unknown where provider did not report billing' },
  finalDecision: 'D1-D9 complete for the explicitly bounded, source-mapped development slice with residual duties and evidence limits recorded. Do not promote this to whole-skill, live-API, human-savings, ecosystem, or all-future-member success.',
  nextAction: 'User-requested summary; no additional development queue is started in this stage.'
};
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ auditedHead: report.auditedHead, stages: stages.map(x => [x.id, x.status]), wholeSkillComplete: false }));
