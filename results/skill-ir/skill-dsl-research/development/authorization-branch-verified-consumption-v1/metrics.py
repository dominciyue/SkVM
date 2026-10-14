"""Offline accounting over completed local archives; never dispatches inference."""
import collections
import json
import pathlib

BASE = pathlib.Path(__file__).resolve().parent
REPO = BASE.parents[4]


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


rows = []
for attempt in load(BASE / "attempts.json"):
    if not attempt.get("session") or attempt["status"] == "running":
        continue
    raw = load(REPO / attempt["session"] / "run.json")
    native = raw.get("native", {})
    samples = native.get("transmissionAccounting", {}).get("samples", [])
    calls = native.get("history", [])
    exact_source_calls = collections.Counter()
    # Call ids are intentionally excluded from repeated request identity.
    exact_source_calls.update(
        json.dumps({"name": h["call"]["name"], "arguments": h["call"].get("arguments")}, sort_keys=True)
        for h in calls if h["call"]["name"].startswith("source_")
    )
    usage = attempt.get("usage") or {}
    rows.append({
        "purpose": attempt["position"], "attempt": attempt["attempt"],
        "status": attempt["status"], "answerDelivery": attempt.get("answerDelivery"),
        "usage": usage, "freshInput": usage.get("input", 0) - usage.get("cacheRead", 0),
        "durationMs": attempt.get("durationMs"), "toolBudget": native.get("toolBudget"),
        "modelToolCalls": len(calls),
        "toolCounts": dict(collections.Counter(h["call"]["name"] for h in calls)),
        "exactRepeatedSourceRequests": sum(n - 1 for n in exact_source_calls.values()),
        "sourceAccounting": raw.get("sourceAccounting"),
        "sentEnvelopeBytes": sum(s["bytes"] for s in samples),
        "sentComponents": {k: sum(s.get("components", {}).get(k, 0) for s in samples)
                           for k in ["source", "taskSkill", "stateGap", "schemaProtocol"]},
        "repeatedPartsBytes": sum(s.get("repeatedBytes", 0) for s in samples),
        "observedTurns": len(attempt.get("turns", [])),
        "terminalTurns": [t["status"] for t in attempt.get("turns", [])],
        "sourceTree": attempt.get("codeEpoch", {}).get("sourceTree"),
    })

result = {
    "providerCalls": 0, "inputIncludesCacheExactlyOnce": True,
    "exactComponentTokens": None, "actualUsd": None, "humanMinutes": None,
    "developmentAndReviewerModelCost": None,
    "interpretation": "Actual wire bytes are not causal token savings. Repeated requests count exact tool-name/argument duplicates only, not overlapping ranges. Failed attempts remain in totals. Missing usage is unknown, never evidence of zero cost.",
    "rows": rows,
    "knownUsage": {k: sum(r["usage"].get(k, 0) for r in rows) for k in ["input", "output", "cacheRead", "cacheWrite"]},
    "knownDurationMs": sum(r["durationMs"] or 0 for r in rows),
}
(BASE / "evaluation/accounting.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"attempts": len(rows), "knownUsage": result["knownUsage"]}))
