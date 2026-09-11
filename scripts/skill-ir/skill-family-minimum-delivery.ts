import { runManifestCli } from "../../src/skill-ir/skill-family-stage-manifest";

export {
  EVIDENCE_ROLES,
  OBLIGATION_DISPOSITIONS,
  parseManifest,
  runManifestCli,
  validateManifest,
} from "../../src/skill-ir/skill-family-stage-manifest";
export type { Manifest } from "../../src/skill-ir/skill-family-stage-manifest";

if (import.meta.main) {
  const manifest = process.argv.find((v) => v.startsWith("--manifest="))?.slice(11);
  const out = process.argv.find((v) => v.startsWith("--out="))?.slice(6);
  const step = process.argv.find((v) => v.startsWith("--step="))?.slice(7);
  const status = process.argv.find((v) => v.startsWith("--status="))?.slice(9);
  const implementationCommit = process.argv.find((v) => v.startsWith("--implementation-commit="))?.slice(24);
  if (manifest && out) { await runManifestCli(manifest, out); }
  else {
    const { continueStage, runStatus, runM1, runP0, runP1, runFreezeGate, runM2, runM3, runM4, runM5, runM6, syncStageManifest, writeCleanReproduction } = await import("../../src/skill-ir/skill-family-minimum-delivery-run");
    const root = process.cwd();
    if (step === "status") console.log(JSON.stringify(await runStatus(root), null, 2));
    else if (step === "m1") console.log(JSON.stringify(await runM1(root).then((r) => ({ selected: r.panel.selectedMemberIds, complete: r.members.map((m) => m.completeForClassScope) })), null, 2));
    else if (step === "p0") console.log(JSON.stringify(await runP0(root), null, 2));
    else if (step === "p1") console.log(JSON.stringify(await runP1(root), null, 2));
    else if (step === "g") console.log(JSON.stringify(await runFreezeGate(root), null, 2));
    else if (step === "m2") console.log(JSON.stringify(await runM2(root), null, 2));
    else if (step === "m3") console.log(JSON.stringify(await runM3(root).then((r) => ({ members: r.members.map((m: any) => ({ memberId: m.memberId, inputQualified: m.inputQualified, inClass: m.inClass, inventorySource: m.extraction?.inventorySource, acceptedArtifactCount: m.acceptedArtifactCount })), accounting: r.accounting })), null, 2));
    else if (step === "m4") console.log(JSON.stringify(await runM4(root), null, 2));
    else if (step === "m5") console.log(JSON.stringify(await runM5(root), null, 2));
    else if (step === "m6") console.log(JSON.stringify(await runM6(root).then((r) => ({ decision: r.decision, reason: r.reason, inputQualifiedCount: r.inputQualifiedCount })), null, 2));
    else if (step === "reproduce") console.log(JSON.stringify(await writeCleanReproduction(root, out), null, 2));
    else if (step === "manifest") {
      if (!implementationCommit || !["no-revision", "revised-once", "reported"].includes(status ?? "")) throw new Error("manifest step requires --status=no-revision|revised-once|reported and --implementation-commit=<40-hex>");
      const manifest = await syncStageManifest(root, status as "no-revision" | "revised-once" | "reported", implementationCommit);
      console.log(JSON.stringify({ status: manifest.status, bodyReadCount: manifest.bodyReadCount, members: manifest.members.length, obligations: manifest.obligations.length, artifacts: manifest.artifacts.length }, null, 2));
    }
    else if (step === "continue" || process.argv.includes("--continue")) {
      const halt = new Set(["reported", "stopped", "clean-reproduction-required"]);
      let last = await continueStage(root);
      console.log(JSON.stringify({ step: last.step }, null, 2));
      while (!halt.has(last.step)) {
        last = await continueStage(root);
        console.log(JSON.stringify({ step: last.step }, null, 2));
      }
    } else throw new Error("usage: --manifest=<path> --out=<path> | --step=status|m1|p0|p1|g|m2|m3|m4|m5|m6|manifest|reproduce|continue");
  }
}
