import { describe, expect, test } from "bun:test"
import { AGENT_TOOLS, commandShellArgs } from "../../src/core/agent-tools.ts"

describe("agent command shell", () => {
  test("prefers a discovered PowerShell 7 executable on Windows", () => {
    const args = commandShellArgs("echo hello", "win32", (name) =>
      name === "pwsh" ? "C:/runtime/pwsh.exe" : null)

    expect(args).toEqual([
      "C:/runtime/pwsh.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "echo hello",
    ])
  })

  test("falls back to Windows PowerShell when pwsh is unavailable", () => {
    expect(commandShellArgs("echo hello", "win32", () => null)[0]).toBe("powershell.exe")
  })

  test("describes the host command language instead of implying POSIX shell syntax", () => {
    const tool = AGENT_TOOLS.find((candidate) => candidate.name === "execute_command")
    expect(tool?.description).toContain(process.platform === "win32" ? "PowerShell" : "POSIX shell")
  })
})
