import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ApiTesterConstructorCandidateSchema,
  buildApiTesterProspectiveExperimentLock,
} from "./api-tester-constructor-prospective";

function value(name: string): string {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  if (!entry) throw new Error(`Missing --${name}=...`);
  return entry.slice(prefix.length);
}

const rootDir = resolve(value("root"));
const outPath = resolve(value("out"));
const candidate = ApiTesterConstructorCandidateSchema.parse(JSON.parse(await readFile(
  resolve(rootDir, "benchmarks", "skill-ir", "classification", "api-tester-constructor-candidate-v1.json"),
  "utf8",
)));
const lock = await buildApiTesterProspectiveExperimentLock({ rootDir, candidate });
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ identity: lock.identity, denominator: lock.denominator, resultState: lock.resultState }));
