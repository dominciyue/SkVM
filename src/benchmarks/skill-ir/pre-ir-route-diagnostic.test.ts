import { describe, expect, test } from "bun:test"
import { compactPreIrRouteDiagnostic } from "./pre-ir-route-diagnostic.ts"

const identity = {
  qualificationId: "experimental-design-v2-fetch-active-runtime-v1",
  calibrationId: "experimental-design-v2-materialized-delta-explicit-child-env-v1",
  model: "xty/gpt-5.6-sol",
  caseId: "experimental-design-v2:skvm:windows:clean:experimental-design-v2-stratified-dev-001",
}

describe("pre-IR fetch-active route diagnostic", () => {
  test("classifies a Bun internal assertion without retaining private stream text", () => {
    const diagnostic = compactPreIrRouteDiagnostic({
      ...identity,
      execution: {
        exitCode: 3,
        timedOut: false,
        durationMs: 158_690,
        stdout: "D:\\private\\workdir secret-model-output",
        stderr: [
          "Bun v1.3.14 (0d9b296a) Windows x64",
          "Args: D:\\private\\skvm.exe --key=secret-value",
          "panic(main thread): Internal assertion failure",
          "oh no: Bun has crashed.",
        ].join("\n"),
      },
    })

    expect(diagnostic).toMatchObject({
      schemaVersion: "skill-ir-fetch-active-route-diagnostic/v1",
      methodEvidence: false,
      status: "agent",
      failureCode: "bun-internal-assertion",
      exitCode: 3,
      timedOut: false,
      runtime: { name: "bun", version: "1.3.14", platform: "windows", arch: "x64" },
    })
    expect(diagnostic.streams.stdoutBytes).toBeGreaterThan(0)
    expect(diagnostic.streams.stderrSha256).toMatch(/^[0-9a-f]{64}$/)
    const serialized = JSON.stringify(diagnostic)
    expect(serialized).not.toContain("private")
    expect(serialized).not.toContain("secret")
    expect(serialized).not.toContain("Args:")
  })

  test("uses a closed failure taxonomy for timeout, provider, adapter, unknown, and success", () => {
    const cases = [
      [{ timedOut: true, stdout: "", stderr: "" }, "timeout"],
      [{ exitCode: 1, timedOut: false, stdout: "", stderr: "ProviderAuthError" }, "provider-auth"],
      [{ exitCode: 1, timedOut: false, stdout: "", stderr: "API error 429" }, "provider-rate-limit"],
      [{ exitCode: 1, timedOut: false, stdout: "", stderr: "ProviderHttpError API error 503" }, "provider-5xx"],
      [{ exitCode: 1, timedOut: false, stdout: "", stderr: "ProviderNetworkError" }, "provider-network"],
      [{ exitCode: 1, timedOut: false, stdout: "", stderr: "Adapter error: pi session threw" }, "adapter-error"],
      [{ exitCode: 7, timedOut: false, stdout: "", stderr: "opaque failure" }, "nonzero-unclassified"],
      [{ exitCode: 0, timedOut: false, stdout: "done", stderr: "" }, "none"],
    ] as const

    for (const [execution, failureCode] of cases) {
      expect(compactPreIrRouteDiagnostic({
        ...identity,
        execution: { durationMs: 1, ...execution },
      }).failureCode).toBe(failureCode)
    }
  })
})
