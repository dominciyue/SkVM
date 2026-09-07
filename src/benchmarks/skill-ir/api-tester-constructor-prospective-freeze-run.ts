import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AiAssistedDevelopmentRoutingSchema } from "./ai-assisted-development-routing";
import {
  buildApiTesterConstructorCandidate,
  buildApiTesterProspectiveExperimentLock,
} from "./api-tester-constructor-prospective";

function value(name: string): string {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  if (!entry) throw new Error(`Missing --${name}=...`);
  return entry.slice(prefix.length);
}

const rootDir = resolve(value("root"));
const candidateOut = resolve(value("candidate-out"));
const lockOut = resolve(value("lock-out"));
const routing = AiAssistedDevelopmentRoutingSchema.parse(JSON.parse(await readFile(
  resolve(rootDir, "benchmarks", "skill-ir", "classification", "ai-assisted-development-routing-v1.json"),
  "utf8",
)));
const candidate = await buildApiTesterConstructorCandidate({ rootDir, routing });
await mkdir(dirname(candidateOut), { recursive: true });
await writeFile(candidateOut, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
const lock = await buildApiTesterProspectiveExperimentLock({ rootDir, candidate });
await mkdir(dirname(lockOut), { recursive: true });
await writeFile(lockOut, `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({
  candidate: candidate.identity,
  experiment: lock.identity,
  denominator: lock.denominator,
  resultState: lock.resultState,
}));
