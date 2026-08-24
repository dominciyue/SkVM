import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  BIDS_SUCCESSOR_ARTIFACT_CONTROL_FREEZE_PATH,
  buildBidsSuccessorArtifactControlFreeze,
  runBidsSuccessorArtifactControls,
} from "./bids-successor-artifact-control.ts"
import { sha256Bytes } from "./source-fixture.ts"

const CONTROL_DIR = "results/skill-ir/bids-successor-artifact-control-v1"

async function main() {
  const rootDir = path.resolve(process.cwd())
  const controlDir = path.resolve(rootDir, ...CONTROL_DIR.split("/"))
  const resultsRoot = path.resolve(rootDir, "results/skill-ir")
  const relative = path.relative(resultsRoot, controlDir)
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("BIDS successor artifact control output path escaped results root")
  }
  await rm(controlDir, { recursive: true, force: true })
  await mkdir(controlDir, { recursive: true })
  const control = await runBidsSuccessorArtifactControls({ rootDir, outDir: controlDir })
  const freeze = await buildBidsSuccessorArtifactControlFreeze({ rootDir, control })
  const freezePath = path.resolve(rootDir, ...BIDS_SUCCESSOR_ARTIFACT_CONTROL_FREEZE_PATH.split("/"))
  await writeFile(freezePath, `${JSON.stringify(freeze, null, 2)}\n`, "utf8")
  return {
    status: freeze.status,
    rows: freeze.controls.rows,
    successfulRows: freeze.controls.successfulRows,
    modelCalls: freeze.controls.modelCalls,
    packageSha256: freeze.artifact.packageManifest.sha256,
    freezeSha256: sha256Bytes(await readFile(freezePath)),
  }
}

if (import.meta.main) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
