import { test, expect } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { CodexAccountAdapter } from "../../adapters/codex-account.ts"
test("the ordinary account adapter forwards owned preparation cancellation before creating transport", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bc-account-cancel-")); await mkdir(path.join(root, "source")); await writeFile(path.join(root, "source/app.py"), "def entry():\n    return False\n")
  const inputFile = path.join(root, "input.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], brief: "Inspect entry and explain the source outcome and limits." }))
  const controller = new AbortController(); controller.abort(); let created = 0; const progress: any[] = []
  const adapter = new CodexAccountAdapter(() => { created++; throw new Error("Mock transport must not be created") })
  await adapter.setup({ model: "gpt-5.6-sol", maxSteps: 12, timeoutMs: 5000, providerOptions: { authorizationScope: inputFile, authorizationDomainTools: true, authorizationMethod: "M", authorizationStrategy: "task-binding-v1", authorizationPreparation: { signal: controller.signal, onProgress: (event: any) => progress.push(event) } } })
  await expect(adapter.run({ prompt: "Inspect entry", workDir: root })).rejects.toThrow("cancelled")
  expect(created).toBe(0); expect(progress.at(-1).state).toBe("cancelled")
})
