import { test, expect, spyOn } from "bun:test"
import { sourcePreparation } from "./preparation.ts"
test("the source preparation deadline ends at successful preparation while cancellation remains effective", () => {
  const clock = spyOn(performance, "now").mockReturnValue(0), controller = new AbortController()
  try {
    const control = sourcePreparation({ timeoutMs: 100, signal: controller.signal }); control.complete()
    clock.mockReturnValue(1000)
    expect(() => control.check()).not.toThrow()
    const completedEvents = control.events.slice()
    control.progress({ currentPath: "late-snapshot.py", completedFiles: 95 })
    expect(control.events).toEqual(completedEvents)
    expect(control.events.at(-1)).toMatchObject({ phase: "complete", state: "completed", elapsedMs: 0, currentPath: null })
    controller.abort(); expect(() => control.check()).toThrow("cancelled")
    expect(() => control.progress()).toThrow("cancelled")
  } finally { clock.mockRestore() }
})
test("an unfinished source preparation still enforces its deadline", () => {
  const clock = spyOn(performance, "now").mockReturnValue(0)
  try { const control = sourcePreparation({ timeoutMs: 100 }); clock.mockReturnValue(1000); expect(() => control.complete()).toThrow("deadline exceeded") }
  finally { clock.mockRestore() }
})
