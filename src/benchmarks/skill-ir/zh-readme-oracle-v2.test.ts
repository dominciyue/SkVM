import { describe, expect, test } from "bun:test"
import { deriveZhReadmeFactsV2, matchesZhReadmeCommand, matchesZhReadmeLicense } from "./zh-readme-oracle-v2.ts"

describe("zh-readme v2 public fact equivalence", () => {
  test("does not invent a Node installation command when the repository does not declare one", () => {
    const facts = deriveZhReadmeFactsV2({
      "package.json": JSON.stringify({
        name: "echo-lab",
        description: "Summarize JSONL events.",
        license: "MIT",
        scripts: { start: "node src/cli.js", test: "node --test" },
      }),
      "src/cli.js": "// Usage: echo-lab --input events.jsonl --level warn\n",
    })
    expect(facts.status).toBe("confirmed")
    if (facts.status !== "confirmed") return
    expect(facts.commands.filter((entry) => entry.role === "installation")).toEqual([])
  })

  test("accepts bounded npm aliases, script bodies, and documented argument placeholders", () => {
    const facts = deriveZhReadmeFactsV2({
      "package.json": JSON.stringify({
        name: "echo-lab",
        description: "Summarize JSONL events.",
        license: "MIT",
        scripts: { start: "node src/cli.js", test: "node --test" },
      }),
      "src/cli.js": "// Usage: echo-lab --input events.jsonl --level warn\n",
    })
    expect(facts.status).toBe("confirmed")
    if (facts.status !== "confirmed") return
    expect(matchesZhReadmeCommand("npm start", facts.commands)).toBe(true)
    expect(matchesZhReadmeCommand("node src/cli.js", facts.commands)).toBe(true)
    expect(matchesZhReadmeCommand("echo-lab --input <JSONL 文件> --level warn", facts.commands)).toBe(true)
    expect(matchesZhReadmeCommand("npm install -g .", facts.commands)).toBe(false)
    expect(matchesZhReadmeCommand("echo-lab --delete-all", facts.commands)).toBe(false)
  })

  test("accepts public SPDX display equivalents without broad fuzzy matching", () => {
    expect(matchesZhReadmeLicense("本项目采用 Apache License 2.0。", "Apache-2.0")).toBe(true)
    expect(matchesZhReadmeLicense("本项目采用 MIT License。", "MIT")).toBe(true)
    expect(matchesZhReadmeLicense("本项目采用 GPL-3.0。", "Apache-2.0")).toBe(false)
  })
})
