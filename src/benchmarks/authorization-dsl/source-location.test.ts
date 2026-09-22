import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { locateAuthorizationSource } from "./source-location.ts"
import { runAuthorizationCli } from "../../cli/authorization.ts"

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(content = "header\r\ncall(x)\r\ncall(y)\r\nend\r\n") {
  const root = await mkdtemp(path.join(tmpdir(), "authorization-locate-"))
  roots.push(root)
  await writeFile(path.join(root, "source.ts"), content)
  return root
}

test("locates literal zero/unique/multiple matches with current-file CRLF line numbers and context", async () => {
  const root = await fixture()
  const multiple = await locateAuthorizationSource({ root, file: "source.ts", match: "call(" })
  expect(multiple.status).toBe("multiple")
  expect(multiple.lineCount).toBe(4)
  expect(multiple.matches.map(m => m.line)).toEqual([2, 3])
  expect(multiple.matches[0]!.context[0]).toEqual({ line: 1, text: "header" })
  expect((await locateAuthorizationSource({ root, file: "source.ts", match: "call(x)" })).status).toBe("unique")
  expect((await locateAuthorizationSource({ root, file: "source.ts", match: ".*" })).status).toBe("zero")
  expect(multiple.lineNumberBasis).toBe("current-provided-file")
})

test("truncates without selecting the first match and handles empty source", async () => {
  const root = await fixture(Array.from({length:25}, () => "same").join("\n"))
  const result = await locateAuthorizationSource({root, file:"source.ts", match:"same"})
  expect(result.matches).toHaveLength(20)
  expect(result.truncated).toBe(true)
  expect(result.totalMatches).toBe(25)
  expect(result.status).toBe("multiple")
  await writeFile(path.join(root, "empty.ts"), "")
  expect((await locateAuthorizationSource({root,file:"empty.ts",match:"x"})).lineCount).toBe(0)
})

test("rejects escaped paths, NUL, invalid match/limit, missing files and junction escapes", async () => {
  const root = await fixture()
  const outside = await fixture()
  for (const file of ["../source.ts", path.join(outside,"source.ts"), "x\0.ts", "missing.ts"]) {
    const result = await locateAuthorizationSource({root,file,match:"call"})
    expect(result.status).toBe("invalid")
    expect(result.diagnostics.length).toBeGreaterThan(0)
  }
  await symlink(outside,path.join(root,"outside"),"junction")
  expect((await locateAuthorizationSource({root,file:"outside/source.ts",match:"call"})).diagnostics[0]!.code).toBe("symlink-escape")
  expect((await locateAuthorizationSource({root,file:"source.ts",match:""})).status).toBe("invalid")
  expect((await locateAuthorizationSource({root,file:"source.ts",match:"x",limit:0})).status).toBe("invalid")
})

test("public locate is provider-free with literal help and stable argument diagnostics", async () => {
  const root = await fixture()
  const output: string[] = []
  let factories = 0
  const deps = {stdout:(s:string)=>output.push(s),stderr:(s:string)=>output.push(s), providerFactory:()=>{ factories++; throw Error("must not load") }}
  expect(await runAuthorizationCli(["locate",`--root=${root}`,"--file=source.ts","--match=call(x)"],deps)).toBe(0)
  expect(JSON.parse(output[0]!).status).toBe("unique")
  expect(await runAuthorizationCli(["locate",`--root=${root}`,"--file=source.ts"],deps)).toBe(2)
  await runAuthorizationCli(["--help"],deps)
  expect(output.at(-1)).toContain("literal")
  expect(factories).toBe(0)
})
