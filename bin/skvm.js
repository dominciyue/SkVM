#!/usr/bin/env node
// Node shim that execs the real skvm binary fetched by install/postinstall.js.
// Works for both the `npm i -g @ipads-skvm/skvm` path and the local dev path:
//   - installed: bin/skvm (compiled Bun binary) sits next to this shim
//   - installed artifact: bin/skvm-artifact (compiled companion) handles
//     `skvm artifact`; source checkouts fall back to the TypeScript entrypoint
//   - dev:       no binary present, fall back to `bun run <repo>/src/index.ts`
// npm's bin symlink points at this .js file (package.json bin.skvm), while the
// native binary has no extension — the two filenames coexist without collision.

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { resolveSkvmInvocation } from "./skvm-route.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const invocation = resolveSkvmInvocation({ here, argv: process.argv.slice(2) })

if (invocation.error) {
  console.error(invocation.error)
  process.exit(1)
}

const result = spawnSync(invocation.cmd, invocation.args, { stdio: "inherit", env: invocation.env })
if (result.error) {
  console.error(`skvm: failed to spawn ${invocation.cmd}: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
