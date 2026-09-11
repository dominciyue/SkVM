import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const sha = b => createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', ['-c', 'safe.directory=D:/skill优化/SkVM', ...args], { maxBuffer: 16000000 });
const base = 'results/skill-ir/skill-family-new-members-20260911-r5/';
const read = p => JSON.parse(readFileSync(p));
const binding = read(base + 'method-binding.json');
const preflight = read(base + 'preflight.json');
const checks = binding.files.map(row => {
  const bytes = git('show', `${binding.frozenCommit}:${row.path}`);
  const rawSha256 = sha(bytes);
  const crlfSha256 = sha(Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n')));
  const historical = preflight.hashChecks.find(item => item.path === row.path);
  let survivingCheckout = null;
  if (row.sha256 !== rawSha256 && row.sha256 !== crlfSha256) {
    const current = readFileSync(row.path);
    const snapshot = `results/skill-ir/skill-family-final-audit-20260911/${row.path.replaceAll('/', '--')}.raw`;
    if (!existsSync(snapshot)) writeFileSync(snapshot, current, { flag: 'wx' });
    survivingCheckout = { sha256: sha(current), matchesBinding: sha(current) === row.sha256,
      normalizedTextMatchesGit: current.toString('utf8').replace(/\r\n/g, '\n') === bytes.toString('utf8').replace(/\r\n/g, '\n'),
      crlfCount: (current.toString().match(/\r\n/g) ?? []).length,
      bareLfCount: (current.toString().match(/(?<!\r)\n/g) ?? []).length,
      snapshot, snapshotSha256: sha(readFileSync(snapshot)) };
  }
  return { ...row, gitBlobSha256: rawSha256, crlfSha256,
    matchesGitBlob: row.sha256 === rawSha256, matchesCrlfCheckout: row.sha256 === crlfSha256,
    survivingCheckout,
    historicalPreflightExact: historical?.expected === row.sha256 && historical?.actual === row.sha256 && historical?.match === true };
});
const differences = [];
function diff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[key], b[key], `${path}/${key}`);
  } else differences.push({ path, before: a, after: b });
}
diff(read(base + 'skill-responsibilities.json'), read(base + 'skill-responsibilities-2.json'));
const original = read('results/skill-ir/skill-family-deepening-20260911/sources.json');
const counts = { primaryBodies: original.skills.filter(s => s.files.some(f => f.kind === 'skill')).length,
  repositories: new Set(original.skills.map(s => s.repository)).size,
  sourceFiles: new Set(original.skills.flatMap(s => s.files.map(f => f.localPath))).size };
const output = process.argv.find(a => a.startsWith('--out='))?.slice(6);
if (!output) throw new Error('--out required');
const report = { schemaVersion: 'skill-family-history-audit/v1', exposure: 'development',
  auditedHead: git('rev-parse', 'HEAD').toString().trim(),
  bindingCommit: binding.frozenCommit, checks, differences, initialAcquisition: counts,
  changedPathsFromResume: git('diff', '--name-only', '8174da605c561921791c3a16c9dae9e904b0e33b', 'HEAD').toString().trim().split('\n'),
  limitation: 'Git blob versus CRLF checkout differences are separately classified, not silently normalized into raw hash matches. Current files are not asserted equal to historical method.' };
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ checks: checks.length, gitExact: checks.filter(r => r.matchesGitBlob).length,
  crlfOnly: checks.filter(r => !r.matchesGitBlob && r.matchesCrlfCheckout).length,
  unresolved: checks.filter(r => !r.matchesGitBlob && !r.matchesCrlfCheckout), differences, counts }));
