import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const EXPECTED_OUTPUT_SHA256 = "3a83e0530c3a04a81dcbb25d8488ec2f19a8da3417f109e6980481d5a3ce4a4e";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function checkVerifiedArtifact(options: {
  rootDir: string;
  workDir: string;
  initialWorkdirManifest?: { path: string; sha256: string };
}) {
  try {
    if (!options.initialWorkdirManifest) return { status: "fail" as const, detail: "initial workdir manifest is required" };
    const manifestBytes = await readFile(options.initialWorkdirManifest.path);
    if (sha256(manifestBytes) !== options.initialWorkdirManifest.sha256) return { status: "fail" as const, detail: "initial workdir manifest digest mismatch" };
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as { entries?: Array<{ path?: unknown }> };
    const paths = manifest.entries?.map((entry) => entry.path) ?? [];
    if (!paths.includes("report.md") || !paths.includes("release-audit-interface.json") || paths.includes("release-audit-output.json") || paths.includes("artifact-observations.json")) {
      return { status: "fail" as const, detail: "initial workdir does not match the Magpie shadow ABI" };
    }
    const output = await readFile(join(options.workDir, "release-audit-output.json"));
    const actual = sha256(output);
    return actual === EXPECTED_OUTPUT_SHA256
      ? { status: "pass" as const, detail: "fixed public Magpie case output digest matches P1; original rerun=0; upstream judge equivalence not claimed" }
      : { status: "fail" as const, detail: "fixed public Magpie case output digest mismatch: " + actual };
  } catch (error) {
    return { status: "fail" as const, detail: error instanceof Error ? error.message : String(error) };
  }
}
