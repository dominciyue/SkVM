"""Offline accounting over BO actual client wire; never dispatches inference."""
import collections
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[4]


def load(file):
    return json.loads(file.read_text(encoding="utf-8"))


def size(value):
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


rows = []
for attempt in load(BASE / "attempts.json"):
    if not attempt.get("session") or attempt["status"] == "running":
        continue
    session = REPO / attempt["session"]
    raw = load(session / "run.json")
    native = raw.get("native", {})
    samples = native.get("transmissionAccounting", {}).get("samples", [])
    calls = native.get("history", [])
    repeated = collections.Counter(json.dumps({"name": h["call"]["name"], "arguments": h["call"].get("arguments")}, sort_keys=True) for h in calls if h["call"]["name"].startswith("source_"))
    wire = []
    for file in sorted((session / "raw").glob("account-turn-*.json")):
        turn = load(file)
        clients = [e for e in turn["events"] if e.get("direction") == "client"]
        start = next((e["params"] for e in clients if e.get("method") == "thread/start"), {})
        prompts = [e["params"]["input"] for e in clients if e.get("method") == "turn/start"]
        replies = [e["result"]["contentItems"] for e in clients if "contentItems" in e.get("result", {})]
        contexts = []
        for reply in replies:
            for item in reply:
                try:
                    value = json.loads(item.get("text", "{}"))
                    if isinstance(value, dict):
                        contexts.append(value.get("currentContext", {}))
                except (ValueError, AttributeError):
                    pass
        indexes = [c["sourceIndex"] for c in contexts if "sourceIndex" in c]
        deltas = [i["sourceIndexDelta"] for i in indexes if isinstance(i, dict) and "sourceIndexDelta" in i]
        wire.append({"raw": file.name, "tools": [t["name"] for t in start.get("dynamicTools", [])], "toolSchemaBytes": size(start.get("dynamicTools", [])), "promptBytes": sum(map(size, prompts)), "toolReplies": len(replies), "replyBytes": sum(map(size, replies)), "sourceIndexBytes": sum(map(size, indexes)), "deltaPackets": len(deltas), "deltaUpserts": sum(len(d["upsert"]) for d in deltas), "deltaRemovals": sum(len(d["removed"]) for d in deltas), "sourceWindowsBytes": sum(size(c["sourceWindows"]) for c in contexts if "sourceWindows" in c), "finalChild": start.get("dynamicTools") == []})
    usage = attempt.get("usage")
    rows.append({"purpose": attempt["position"], "attempt": attempt["attempt"], "status": attempt["status"], "answerDelivery": attempt.get("answerDelivery"), "usage": usage, "freshInput": usage["input"] - usage.get("cacheRead", 0) if usage and "input" in usage else None, "durationMs": attempt.get("durationMs"), "toolBudget": native.get("toolBudget"), "modelToolCalls": len(calls), "toolCounts": dict(collections.Counter(h["call"]["name"] for h in calls)), "exactRepeatedSourceRequests": sum(n - 1 for n in repeated.values()), "sourceAccounting": raw.get("sourceAccounting"), "sentEnvelopeBytes": sum(s["bytes"] for s in samples), "sentComponents": {k: sum(s.get("components", {}).get(k, 0) for s in samples) for k in ["source", "taskSkill", "stateGap", "schemaProtocol"]}, "repeatedPartsBytes": sum(s.get("repeatedBytes", 0) for s in samples), "observedTurns": len(attempt.get("turns", [])), "terminalTurns": [t["status"] for t in attempt.get("turns", [])], "sourceTree": attempt.get("codeEpoch", {}).get("sourceTree"), "actualWire": wire})

result = {"providerCalls": 0, "inputIncludesCacheExactlyOnce": True, "exactComponentTokens": None, "actualUsd": None, "humanMinutes": None, "developmentAndReviewerModelCost": None, "interpretation": "Actual client wire bytes are diagnostics, not causal token savings. Exact repeated source requests exclude call IDs and do not measure overlapping ranges. Missing usage stays unknown. Failed purposes remain in the ledger and totals.", "rows": rows, "knownUsage": {k: sum((r["usage"] or {}).get(k, 0) for r in rows) for k in ["input", "output", "cacheRead", "cacheWrite"]}, "unknownUsagePurposes": [r["purpose"] for r in rows if r["usage"] is None], "knownDurationMs": sum(r["durationMs"] or 0 for r in rows)}
(BASE / "evaluation/accounting.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"attempts": len(rows), "knownUsage": result["knownUsage"]}))
