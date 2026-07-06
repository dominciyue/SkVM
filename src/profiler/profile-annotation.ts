import type { ProfileAnnotation } from "../skill-ir/schema";
import type { ExecutionTrace, TraceEvent } from "./trace-schema";

type AnnotationDraft = {
  count: number;
  firstTraceId: string;
  eventKind: TraceEvent["kind"];
};

const PROFILE_EVENT_KINDS = new Set<TraceEvent["kind"]>(["rule-violation", "step-skip", "tool-error"]);

function observationForEvent(targetRef: string, kind: TraceEvent["kind"]): ProfileAnnotation["observation"] {
  if (kind === "step-skip" || targetRef.startsWith("step-")) {
    return "frequent-skip";
  }

  if (kind === "tool-error" || targetRef.startsWith("tool-")) {
    return "environment-sensitive";
  }

  return "frequent-failure";
}

export function buildProfileAnnotations(traces: ExecutionTrace[]): ProfileAnnotation[] {
  const drafts = new Map<string, AnnotationDraft>();

  for (const trace of traces) {
    for (const event of trace.events) {
      if (!PROFILE_EVENT_KINDS.has(event.kind)) {
        continue;
      }

      const existing = drafts.get(event.targetRef);
      drafts.set(event.targetRef, {
        count: (existing?.count ?? 0) + 1,
        firstTraceId: existing?.firstTraceId ?? trace.traceId,
        eventKind: existing?.eventKind ?? event.kind,
      });
    }
  }

  return [...drafts.entries()]
    .filter(([, draft]) => draft.count >= 2)
    .map(([targetRef, draft]) => ({
      id: `profile-${targetRef}`,
      sourceTrace: draft.firstTraceId,
      targetRef,
      observation: observationForEvent(targetRef, draft.eventKind),
      evidenceCount: draft.count,
      suggestedPass: "profile-guided-repair",
    }));
}
