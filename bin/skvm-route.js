import { existsSync } from "node:fs"
import path from "node:path"

/**
 * Resolve the executable for the Node shim without importing the Bun runtime.
 * The artifact command is a companion binary in packaged installs and falls
 * back to the TypeScript entrypoint only in a source checkout.
 */
export function resolveSkvmInvocation({
  here,
  argv,
  platform = process.platform,
  env = process.env,
  exists = existsSync,
}) {
  const repoRoot = path.resolve(here, "..")
  const command = argv[0]
  const installEnv = { ...env, SKVM_INSTALL_ROOT: repoRoot }

  if (command === "artifact") {
    const artifactBinary = path.join(here, platform === "win32" ? "skvm-artifact.exe" : "skvm-artifact")
    const artifactEntry = path.join(repoRoot, "src", "cli", "artifact.ts")
    if (exists(artifactBinary)) {
      return { cmd: artifactBinary, args: argv.slice(1), env: installEnv }
    }
    if (exists(artifactEntry)) {
      const bun = env.SKVM_BUN_BIN || (platform === "win32" ? "bun.exe" : "bun")
      return { cmd: bun, args: ["run", artifactEntry, ...argv.slice(1)], env }
    }
    return {
      error:
        `skvm: artifact companion not found at ${artifactBinary} and no src/cli/artifact.ts next to this shim.\n` +
        "If you installed via npm, re-run `npm i -g @ipads-skvm/skvm` so postinstall can download the companion.\n" +
        "If you are a contributor running from source, run `bun run src/cli/artifact.ts` directly.",
    }
  }

  const binary = path.join(here, platform === "win32" ? "skvm.exe" : "skvm")
  if (exists(binary)) return { cmd: binary, args: argv, env: installEnv }

  const entry = path.join(repoRoot, "src", "index.ts")
  if (exists(entry)) {
    const bun = env.SKVM_BUN_BIN || (platform === "win32" ? "bun.exe" : "bun")
    return { cmd: bun, args: ["run", entry, ...argv], env }
  }

  return {
    error:
      `skvm: binary not found at ${binary} and no src/index.ts next to this shim.\n` +
      "If you installed via npm, re-run `npm i -g @ipads-skvm/skvm` so postinstall can download the binary.\n" +
      "If you are a contributor running from source, run `bun run src/index.ts` directly.",
  }
}
