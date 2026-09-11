// Explicit public-resource acquisition, never execute downloaded instructions.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = dirname(fileURLToPath(import.meta.url));
if (existsSync(resolve(out, 'acquisition.json'))) throw new Error('Preserve existing acquisition; do not retry under this identity.');
const commit = '9d93d0410362cceb14c2597b12bc465fc2062bd4';
const paths = ['skills/core/coverage.md', 'skills/core/test-type-matrix.md', 'skills/core/methods/state-machine.md', 'skills/core/case-format.md'];
const rows = [];
for (const path of paths) {
  const url = `https://raw.githubusercontent.com/fishzjp/qa-skills/${commit}/${path}`;
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const localPath = `raw/${path}`;
    mkdirSync(dirname(resolve(out, localPath)), { recursive: true });
    writeFileSync(resolve(out, localPath), bytes, { flag: 'wx' });
    rows.push({ path, url, startedAt, status: response.status, localPath, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  } catch (error) {
    rows.push({ path, url, startedAt, status: 'request-error', error: String(error) });
  }
}
writeFileSync(resolve(out, 'acquisition.json'), JSON.stringify({ schemaVersion: 'fixed-resource-acquisition/v1', exposure: 'development', repository: 'fishzjp/qa-skills', commit, requests: rows.length, newSkillBodies: 0, rows }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.map(({ path, status, byteLength }) => ({ path, status, byteLength }))));
