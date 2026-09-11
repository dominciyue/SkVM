import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const repos = ['LambdaTest/agent-skills', 'jeremylongshore/tons-of-skills-marketplace', 'pactflow/pactflow-agent-skills', 'a5c-ai/babysitter', 'TerminalSkills/skills', 'alirezarezvani/claude-code-skill-factory', 'anhtester/antigravity-testing-kit'];
const rows = [];
let requestsThisRun = 0;
for (const repository of repos) {
  const file = `${repository.replace('/', '--')}.json`;
  let raw;
  if (existsSync(resolve(root, file))) raw = readFileSync(resolve(root, file));
  else {
    requestsThisRun++;
    raw = execFileSync('gh', ['api', `repos/${repository}`], { encoding: 'buffer', timeout: 30000 });
    writeFileSync(resolve(root, file), raw, { flag: 'wx' });
  }
  const data = JSON.parse(raw);
  rows.push({ requestedRepository: repository, returnedRepository: data.full_name, fork: data.fork,
    parent: data.parent?.full_name ?? null, source: data.source?.full_name ?? null,
    owner: data.owner?.login, description: data.description, createdAt: data.created_at,
    archived: data.archived, file, sha256: createHash('sha256').update(raw).digest('hex') });
}
const report = { schemaVersion: 'repository-origin-observation/v1', exposure: 'development', observedAt: new Date().toISOString(), requestsThisRun, rows,
  limitation: 'Current GitHub repository metadata is not pinned historical authorship proof. fork=false cannot rule out copied skills, imports or independent reimplementations.' };
writeFileSync(resolve(root, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
