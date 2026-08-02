import { describe, expect, test } from "bun:test"
import { deriveZhReadmeFacts } from "./zh-readme-oracle.ts"

describe("zh-readme source-derived repository facts", () => {
  test("derives Node identity, commands, paths, license, and declared links", () => {
    const facts = deriveZhReadmeFacts({
      "package.json": `${JSON.stringify({
        name: "echo-lab",
        description: "Filter JSON Lines events.",
        license: "MIT",
        homepage: "https://example.org/echo-lab/docs",
        repository: { url: "https://github.com/example/echo-lab" },
        bin: { "echo-lab": "src/cli.js" },
        scripts: { start: "node src/cli.js", test: "node --test", lint: "node --check src/cli.js" },
      })}\n`,
      "src/cli.js": "// Usage: echo-lab --input events.jsonl --level warn\n",
      "LICENSE": "MIT License\n",
    })
    expect(facts.status).toBe("confirmed")
    if (facts.status !== "confirmed") return
    expect(facts.project).toEqual({ name: "echo-lab", description: "Filter JSON Lines events.", license: "MIT" })
    expect(facts.commands).toEqual(expect.arrayContaining([
      { role: "installation", command: "npm install", sourcePath: "package.json" },
      { role: "quickstart", command: "echo-lab --input events.jsonl --level warn", sourcePath: "src/cli.js" },
      { role: "development", command: "npm test", sourcePath: "package.json" },
      { role: "development", command: "npm run lint", sourcePath: "package.json" },
    ]))
    expect(facts.paths).toContain("src/cli.js")
    expect(facts.links).toEqual([
      "https://example.org/echo-lab/docs",
      "https://github.com/example/echo-lab",
    ])
  })

  test("derives Python facts and commands from pyproject plus visible usage docs", () => {
    const facts = deriveZhReadmeFacts({
      "pyproject.toml": `[project]\nname = "note-index"\ndescription = "Index local Markdown notes."\nlicense = { text = "Apache-2.0" }\n\n[project.urls]\nHomepage = "https://example.org/note-index"\n\n[project.scripts]\nnote-index = "note_index.cli:main"\n`,
      "src/note_index/cli.py": "def main():\n    pass\n",
      "docs/USAGE.md": "```bash\npython -m pip install .\nnote-index scan notes/\npython -m pytest\n```\n",
      "LICENSE": "Apache License\nVersion 2.0\n",
    })
    expect(facts.status).toBe("confirmed")
    if (facts.status !== "confirmed") return
    expect(facts.project).toEqual({ name: "note-index", description: "Index local Markdown notes.", license: "Apache-2.0" })
    expect(facts.commands).toEqual([
      { role: "installation", command: "python -m pip install .", sourcePath: "docs/USAGE.md" },
      { role: "quickstart", command: "note-index scan notes/", sourcePath: "docs/USAGE.md" },
      { role: "development", command: "python -m pytest", sourcePath: "docs/USAGE.md" },
    ])
    expect(facts.paths).toEqual(expect.arrayContaining(["src/note_index/cli.py", "docs/USAGE.md"]))
    expect(facts.links).toEqual(["https://example.org/note-index"])
  })

  test("removes constraints when public evidence is removed", () => {
    const complete = {
      "package.json": `${JSON.stringify({
        name: "tiny-cli", description: "Tiny CLI.", license: "MIT",
        homepage: "https://example.org/tiny-cli", scripts: { test: "node --test" },
      })}\n`,
      "src/index.js": "export const ok = true\n",
      "LICENSE": "MIT License\n",
    }
    const before = deriveZhReadmeFacts(complete)
    const after = deriveZhReadmeFacts({
      "package.json": `${JSON.stringify({ name: "tiny-cli", description: "Tiny CLI." })}\n`,
      "src/index.js": complete["src/index.js"],
    })
    expect(before.status).toBe("confirmed")
    expect(after.status).toBe("confirmed")
    if (before.status !== "confirmed" || after.status !== "confirmed") return
    expect(before.links).toEqual(["https://example.org/tiny-cli"])
    expect(after.links).toEqual([])
    expect(before.commands.some((entry) => entry.command === "npm test")).toBe(true)
    expect(after.commands.some((entry) => entry.command === "npm test")).toBe(false)
    expect(before.project.license).toBe("MIT")
    expect(after.project.license).toBeUndefined()
  })

  test("keeps unsupported repositories unconfirmed instead of guessing", () => {
    expect(deriveZhReadmeFacts({ "notes.txt": "project maybe useful\n" }))
      .toEqual({ status: "unconfirmed", reason: "supported-manifest-missing" })
    expect(deriveZhReadmeFacts({ "package.json": "{}\n" }))
      .toEqual({ status: "unconfirmed", reason: "project-identity-missing" })
  })
})
