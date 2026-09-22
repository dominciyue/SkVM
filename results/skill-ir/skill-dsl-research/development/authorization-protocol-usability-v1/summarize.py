"""Offline assembly of this bounded development result; no generation or grading."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
read = lambda name: json.loads((root / name).read_text(encoding="utf-8"))
initial = read("panel-summary.json")
revision = read("revision-summary.json")
author = read("author-trial/summary.json")
units = initial["units"] + revision["units"] + author["units"]
tokens = {key: sum(u["telemetry"]["knownTokens"][key] for u in units)
          for key in ("input", "output", "cacheRead", "cacheWrite")}
summary = {
    "schemaVersion": "authorization-protocol-usability-summary/v1",
    "engineeringStatus": "complete",
    "researchOutcome": "mixed-bounded-development",
    "inputs": {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
               for name in ("panel-summary.json", "revision-summary.json", "author-trial/summary.json")},
    "initialMatchedPanel": initial["groups"],
    "sharedRevision": revision["groups"],
    "authorTrial": {"kind": author["participant"], "firstDiagnosticCount": 36,
                    "originalDecision": "deny", "variationDecision": "allow",
                    "bothDecisionsSupported": True, "humanMinutes": None,
                    "secondIndependentAuthoringSuccessTested": False},
    "total": {"analysisUnits": len(units),
              "providerDispatches": sum(u["telemetry"]["providerCalls"] for u in units),
              "knownTokens": tokens,
              "unknownUsageCalls": sum(u["telemetry"]["unknownUsageCalls"] for u in units),
              "actualUSD": None, "agentCosts": "unmeasured", "targetExecutions": 0,
              "protectedInputReads": 0},
    "defaultDecision": {"wire": "legacy", "v4": "explicit-opt-in-for-all-three-methods",
                        "methodOmitted": "conditions when input requests it; otherwise ledger",
                        "reason": "Compact improves observed first delivery and call/token burden, but header timed out where legacy delivered. Keep opt-in; no repeated reliability estimate.",
                        "realWireComparisonMethods": ["conditions"]},
    "limitations": [
        "Four already exposed development tasks, one observation per wire; no general reliability or causal capability claim.",
        "Late header usage is included but its response never becomes delivered success.",
        "Strict-schema revision is separate from initial results; no extra rounds.",
        "Response-only calibration gains are evaluation-version effects; historical Y grades are untouched.",
        "Author trial required main-agent correction after 36 diagnostics, not autonomous authoring or measured human savings.",
        "First-delivery quality evaluates only accepted delivered artifacts; malformed and timeout responses are not counted as semantic successes.",
    ],
}
serialized = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
output = root / "summary.json"
if "--replay" in sys.argv:
    assert output.read_bytes() == serialized.encode("utf-8"), "Summary replay mismatch"
    print(json.dumps({"status": "reproduced", "sha256": hashlib.sha256(serialized.encode()).hexdigest(), "providerCalls": 0}))
else:
    output.write_bytes(serialized.encode("utf-8"))
    print(json.dumps(summary["total"]))
