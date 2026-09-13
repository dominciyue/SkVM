import { describe, expect, test } from "bun:test"
import { RUN_FLAGS, validateRunConfig } from "../../src/cli/run.ts"
import { UsageError } from "../../src/cli/flags.ts"

function expectUsage(config: ReturnType<typeof RUN_FLAGS.parse>, message: string): void {
  if (config.help) throw new Error("unexpected help")
  try {
    validateRunConfig(config)
    throw new Error("expected UsageError")
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError)
    expect((error as UsageError).message).toBe(message)
  }
}

describe("run natural task and optimization flags", () => {
  test("accepts a natural prompt without task.json and defaults the optimizer model", () => {
    const config = RUN_FLAGS.parse([
      "--prompt=Inspect this directory",
      "--skill=./skill",
      "--model=x/source",
      "--optimize",
    ])
    if (config.help) throw new Error("unexpected help")
    expect(validateRunConfig(config)).toEqual({
      taskSource: { kind: "prompt", prompt: "Inspect this directory" },
      optimizerModel: "x/source",
    })
  })

  test("keeps the legacy task source when optimize is absent", () => {
    const config = RUN_FLAGS.parse(["--task=./task.json", "--model=x/source"])
    if (config.help) throw new Error("unexpected help")
    expect(validateRunConfig(config)).toEqual({ taskSource: { kind: "task", path: "./task.json" } })
  })

  test("rejects absent, empty, or conflicting task sources before execution", () => {
    expectUsage(RUN_FLAGS.parse(["--model=x/source"]), "run: exactly one of --task or --prompt is required")
    expectUsage(
      RUN_FLAGS.parse(["--task=./task.json", "--prompt=also do this", "--model=x/source"]),
      "run: --task and --prompt are mutually exclusive",
    )
    expectUsage(
      RUN_FLAGS.parse(["--prompt=   ", "--skill=./skill", "--model=x/source", "--optimize"]),
      "run: --prompt must contain non-whitespace text",
    )
  })

  test("requires a skill and the supported capture adapter for optimization", () => {
    expectUsage(
      RUN_FLAGS.parse(["--prompt=do it", "--model=x/source", "--optimize"]),
      "run: --optimize requires --skill",
    )
    expectUsage(
      RUN_FLAGS.parse(["--prompt=do it", "--skill=./skill", "--model=x/source", "--adapter=opencode", "--optimize"]),
      "run: --optimize currently supports adapter bare-agent; got opencode",
    )
  })

  test("rejects optimization-only output/model flags when optimize is absent", () => {
    expectUsage(
      RUN_FLAGS.parse(["--task=./task.json", "--model=x/source", "--optimizer-model=x/optimizer"]),
      "run: --optimizer-model requires --optimize",
    )
    expectUsage(
      RUN_FLAGS.parse(["--task=./task.json", "--model=x/source", "--package-out=./package"]),
      "run: --package-out requires --optimize",
    )
  })
})
