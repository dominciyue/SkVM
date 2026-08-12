import { describe, expect, test } from "bun:test"
import { runSubprocess } from "./subprocess.ts"

const bun = process.execPath

describe("runSubprocess progress-aware timeouts", () => {
  test("observable stdout lines reset the idle deadline", async () => {
    const result = await runSubprocess([
      bun,
      "-e",
      "let n=0; const t=setInterval(()=>{console.log(JSON.stringify({type:'turn_start',n:++n})); if(n===3){clearInterval(t);}},60)",
    ], {
      timeoutMs: 1_000,
      idleTimeoutMs: 110,
      isStdoutLineActivity: (line) => JSON.parse(line).type === "turn_start",
    })

    expect(result).toMatchObject({ exitCode: 0, timedOut: false })
    expect(result.firstActivityMs).toBeGreaterThan(0)
    expect(result.lastActivityMs).toBeGreaterThanOrEqual(result.firstActivityMs!)
  })

  test("kills a silent process at the idle deadline and reports its kind", async () => {
    const result = await runSubprocess([bun, "-e", "setTimeout(()=>{},1000)"], {
      timeoutMs: 1_000,
      idleTimeoutMs: 80,
      isStdoutLineActivity: () => true,
    })

    expect(result.timedOut).toBe(true)
    expect(result.timeoutKind).toBe("idle")
    expect(result.durationMs).toBeLessThan(600)
  })

  test("absolute deadline remains a hard cap despite continuing activity", async () => {
    const result = await runSubprocess([
      bun,
      "-e",
      "console.log(JSON.stringify({type:'message_update'})); setInterval(()=>console.log(JSON.stringify({type:'message_update'})),40)",
    ], {
      timeoutMs: 600,
      idleTimeoutMs: 300,
      isStdoutLineActivity: () => true,
    })

    expect(result.timedOut).toBe(true)
    expect(result.timeoutKind).toBe("absolute")
    expect(result.firstActivityMs).toBeGreaterThan(0)
  })

  test("supports an observable line limit distinct from timeout", async () => {
    let turns = 0
    const result = await runSubprocess([
      bun,
      "-e",
      "setInterval(()=>console.log(JSON.stringify({type:'turn_end'})),20)",
    ], {
      timeoutMs: 1_000,
      shouldStopAfterStdoutLine: (line) => JSON.parse(line).type === "turn_end" && ++turns >= 3,
    })

    expect(result.timedOut).toBe(false)
    expect(result.stoppedByStdoutLine).toBe(true)
    expect(result.stdout.trim().split("\n")).toHaveLength(3)
  })
})
