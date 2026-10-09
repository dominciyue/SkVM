import { test, expect, spyOn } from "bun:test"
import { sourcePreparation } from "./preparation.ts"
test("the source preparation deadline ends at successful preparation while cancellation remains effective", () => {
  const clock = spyOn(performance, "now").mockReturnValue(0), controller = new AbortController()
  try {
    const control = sourcePreparation({ timeoutMs: 100, signal: controller.signal }); control.complete()
    clock.mockReturnValue(1000)
    expect(() => control.check()).not.toThrow()
    controller.abort(); expect(() => control.check()).toThrow("cancelled")
  } finally { clock.mockRestore() }
})
test("an unfinished source preparation still enforces its deadline", () => {
  const clock = spyOn(performance, "now").mockReturnValue(0)
  try { const control = sourcePreparation({ timeoutMs: 100 }); clock.mockReturnValue(1000); expect(() => control.complete()).toThrow("deadline exceeded") }
  finally { clock.mockRestore() }
})
