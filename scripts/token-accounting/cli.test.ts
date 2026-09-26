import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { buildTokenReport } from "./report.ts"

const fixture = {
  schemaVersion: "token-accounting-input/v1",
  groups: ["md", "dsl"].map((id, index) => ({
    id, account: "analysis", source: "fixture", semantics: "skvm-disjoint", evidence: "explicit matched arms",
    observations: [{ id: `${id}-call`, semantics: "skvm-disjoint", input: index ? 77875 : 69011,
      output: index ? 8994 : 8572, cacheRead: index ? 0 : 6528, cacheWrite: 0, actualUSD: null, evidence: "fixture" }],
  })),
  comparisons: [{ baseline: "md", candidate: "dsl" }],
}
const tempDirs: string[] = []
afterEach(() => { for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true }) })
function setup() {
  const dir = mkdtempSync(join(import.meta.dir, ".test-")); tempDirs.push(dir)
  const input = join(dir, "input.json"); writeFileSync(input, JSON.stringify(fixture))
  return { dir, input }
}
function run(args: string[]) {
  const result = Bun.spawnSync([process.execPath, join(import.meta.dir, "cli.ts"), ...args], { stdout: "pipe", stderr: "pipe" })
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() }
}

test("versioned report sorts groups and refuses accidental mixed accounts or duplicate IDs", () => {
  const report = buildTokenReport(fixture)
  expect(report.groups.map(g => g.group.id)).toEqual(["dsl", "md"])
  expect(report.comparisons[0]!.metrics.totalTokens.percentChange).toBe(3.2790003685605917)
  expect(buildTokenReport({ ...fixture, groups: [...fixture.groups].reverse() })).toEqual(report)
  expect(() => buildTokenReport({ ...fixture, schemaVersion: "future" })).toThrow()
  const duplicate = structuredClone(fixture); duplicate.groups[1]!.observations[0]!.id = "md-call"
  expect(() => buildTokenReport(duplicate)).toThrow(/duplicate/i)
  const mixed = structuredClone(fixture); mixed.groups[1]!.account = "author"
  expect(() => buildTokenReport(mixed)).toThrow(/account/i)
  expect(() => buildTokenReport({ ...fixture, comparisons: [{ baseline: "missing", candidate: "dsl" }] })).toThrow()
  expect(() => buildTokenReport({ ...fixture, groups: [fixture.groups[0], fixture.groups[0]] })).toThrow(/duplicate/i)
})

test("explicit CLI writes deterministic stdout and preserves input bytes", () => {
  const { input } = setup(); const before = readFileSync(input)
  const result = run([`--input=${input}`])
  expect(result.code).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(buildTokenReport(fixture))
  expect(result.stderr).toBe("")
  expect(readFileSync(input)).toEqual(before)
})

test("exclusive output refuses existing files including the input itself", () => {
  const { dir, input } = setup(); const output = join(dir, "out.json")
  expect(run([`--input=${input}`, `--out=${output}`]).code).toBe(0)
  const before = readFileSync(output)
  expect(run([`--input=${input}`, `--out=${output}`]).code).toBe(1)
  expect(readFileSync(output)).toEqual(before)
  expect(run([`--input=${input}`, `--out=${input}`]).code).toBe(1)
  expect(JSON.parse(readFileSync(input, "utf8"))).toEqual(fixture)
})

test("rejects invalid arguments and malformed input before creating output", () => {
  const { dir, input } = setup(); const output = join(dir, "out.json")
  for (const args of [[], ["--input="], [`--input=${input}`, "--fetch"], [`--input=${input}`, `--input=${input}`]]) {
    expect(run(args).code).toBe(1)
  }
  writeFileSync(input, '{"schemaVersion":"bad"}')
  expect(run([`--input=${input}`, `--out=${output}`]).code).toBe(1)
  expect(existsSync(output)).toBe(false)
})
