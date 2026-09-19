import {
  parse as parseIcuMessage,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import {
  findProtectionTokens,
  scanLexicalProtections,
  type ExtractionResult,
  type LexicalProtectionKind,
  type ProtectedItem,
  type SourceUnit,
  type UnitReplacement,
} from "./units";

export type ConstraintCheckStatus = "pass" | "fail" | "not-applicable" | "unknown";

export interface ConstraintDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  unitId?: string;
}

export interface ConstraintCheck {
  id:
    | "target-locale"
    | "selected-unit-coverage"
    | "selection-completeness"
    | "protected-occurrences"
    | "nonempty-targets"
    | "unchanged-targets"
    | "message-profile";
  status: ConstraintCheckStatus;
  detail: string;
}

export interface SelectionCompletenessAssessment {
  status: "verified" | "unknown" | "failed";
  reason: string;
  missingSourceRanges?: string[];
}

export interface ConstraintValidationInput {
  extraction: ExtractionResult;
  replacements: UnitReplacement[];
  requestedTargetLocales: string[];
  targetLocale: string | null;
  messageProfiles?: Record<string, "classic-icu" | string>;
  selectionCompleteness?: SelectionCompletenessAssessment;
  unchangedPolicy?: "allow" | "review" | "fail";
  lexicalProtectionKinds?: readonly LexicalProtectionKind[];
}

export interface ConstraintValidationResult {
  deterministicStatus: "pass" | "fail";
  checks: ConstraintCheck[];
  diagnostics: ConstraintDiagnostic[];
  semanticReview: "required";
}

function canonicalIcuElements(elements: MessageFormatElement[]): string {
  const descriptors = elements.flatMap((element): string[] => {
    switch (element.type) {
      case TYPE.literal:
        return [];
      case TYPE.pound:
        return ["pound"];
      case TYPE.argument:
        return [`argument:${element.value}`];
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        return [`formatted:${element.type}:${element.value}:${JSON.stringify(element.style ?? null)}`];
      case TYPE.tag:
        return [`tag:${element.value}:${canonicalIcuElements(element.children)}`];
      case TYPE.select: {
        const options = Object.entries(element.options)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, option]) => `${key}:${canonicalIcuElements(option.value)}`);
        return [`select:${element.value}:{${options.join("|")}}`];
      }
      case TYPE.plural: {
        const options = Object.entries(element.options)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, option]) => `${key}:${canonicalIcuElements(option.value)}`);
        return [
          `plural:${element.value}:${element.pluralType}:offset=${element.offset}:{${options.join("|")}}`,
        ];
      }
    }
  });
  return `[${descriptors.sort().join(",")}]`;
}

function expandProtectedTokens(
  replacement: string,
  unit: SourceUnit,
  itemById: Map<string, ProtectedItem>,
): string {
  let expanded = replacement;
  for (const itemId of unit.protectedItemIds) {
    const item = itemById.get(itemId);
    if (item) expanded = expanded.split(item.token).join(item.sourceText);
  }
  return expanded;
}

export function validateTranslationConstraints(
  input: ConstraintValidationInput,
): ConstraintValidationResult {
  const diagnostics: ConstraintDiagnostic[] = [];
  const checks: ConstraintCheck[] = [];
  const add = (
    code: string,
    severity: ConstraintDiagnostic["severity"],
    message: string,
    unitId?: string,
  ) => diagnostics.push({ code, severity, message, ...(unitId ? { unitId } : {}) });

  if (input.targetLocale === null || input.targetLocale.trim() === "") {
    add("missing-target-locale", "error", "A target locale is required before translation.");
    checks.push({ id: "target-locale", status: "fail", detail: "The target locale is absent." });
  } else if (!input.requestedTargetLocales.includes(input.targetLocale)) {
    add(
      "undeclared-target-locale",
      "error",
      `Target locale ${input.targetLocale} is not present in the declared target set.`,
    );
    checks.push({ id: "target-locale", status: "fail", detail: "The target locale was not declared." });
  } else {
    checks.push({ id: "target-locale", status: "pass", detail: `Target locale ${input.targetLocale} is declared.` });
  }

  const unitById = new Map(input.extraction.units.map((unit) => [unit.id, unit]));
  const replacementGroups = new Map<string, UnitReplacement[]>();
  let coverageFailed = false;
  for (const replacement of input.replacements) {
    const unit = unitById.get(replacement.unitId);
    if (!unit) {
      coverageFailed = true;
      add("unknown-unit-result", "error", `Result references unknown unit ${replacement.unitId}.`, replacement.unitId);
      continue;
    }
    const group = replacementGroups.get(replacement.unitId) ?? [];
    group.push(replacement);
    replacementGroups.set(replacement.unitId, group);
  }
  for (const unit of input.extraction.units) {
    const count = replacementGroups.get(unit.id)?.length ?? 0;
    if (count === 0) {
      coverageFailed = true;
      add("missing-unit-result", "error", `No result was returned for selected unit ${unit.id}.`, unit.id);
    } else if (count > 1) {
      coverageFailed = true;
      add("duplicate-unit-result", "error", `More than one result was returned for ${unit.id}.`, unit.id);
    }
  }
  checks.push({
    id: "selected-unit-coverage",
    status: coverageFailed ? "fail" : "pass",
    detail: coverageFailed
      ? "The result is not a one-to-one mapping over selected units."
      : "Every selected unit has exactly one result and no unknown unit is present.",
  });

  const selection = input.selectionCompleteness ?? {
    status: "unknown" as const,
    reason: "No independent selector assessment was supplied.",
  };
  if (selection.status === "failed") {
    add(
      "selection-incomplete",
      "error",
      `${selection.reason}${
        selection.missingSourceRanges?.length
          ? ` Missing ranges: ${selection.missingSourceRanges.join(", ")}.`
          : ""
      }`,
    );
  }
  checks.push({
    id: "selection-completeness",
    status: selection.status === "verified" ? "pass" : selection.status === "failed" ? "fail" : "unknown",
    detail: selection.reason,
  });

  const itemById = new Map(input.extraction.protectedItems.map((item) => [item.id, item]));
  const itemByToken = new Map(input.extraction.protectedItems.map((item) => [item.token, item]));
  let protectionFailed = false;
  for (const unit of input.extraction.units) {
    const replacement = replacementGroups.get(unit.id)?.[0];
    if (!replacement) continue;
    const expectedItems = unit.protectedItemIds
      .map((itemId) => itemById.get(itemId))
      .filter((item): item is ProtectedItem => item !== undefined);
    const actualTokens = findProtectionTokens(replacement.text);
    const actualCounts = new Map<string, number>();
    actualTokens.forEach((token) => actualCounts.set(token, (actualCounts.get(token) ?? 0) + 1));

    for (const token of actualTokens) {
      const item = itemByToken.get(token);
      if (!item) {
        protectionFailed = true;
        add("unknown-protection-token", "error", `Unknown protection token occurs in ${unit.id}.`, unit.id);
      } else if (item.ownerUnitId !== unit.id) {
        protectionFailed = true;
        add(
          "foreign-protection-token",
          "error",
          `Protection token owned by ${item.ownerUnitId ?? "the document skeleton"} occurs in ${unit.id}.`,
          unit.id,
        );
      }
    }

    for (const item of expectedItems) {
      const count = actualCounts.get(item.token) ?? 0;
      if (count === 0) {
        protectionFailed = true;
        add("missing-protection-token", "error", `Protected occurrence ${item.id} is absent.`, unit.id);
      } else if (count > 1) {
        protectionFailed = true;
        add("duplicate-protection-token", "error", `Protected occurrence ${item.id} occurs ${count} times.`, unit.id);
      }
    }

    const introduced = scanLexicalProtections(replacement.text, input.lexicalProtectionKinds);
    for (const candidate of introduced) {
      protectionFailed = true;
      add(
        "untracked-protected-content",
        "error",
        `Replacement introduced untracked ${candidate.kind} content: ${candidate.sourceText}`,
        unit.id,
      );
    }

    const expectedFixed = expectedItems
      .filter((item) => item.movement === "fixed-order")
      .map((item) => item.token);
    const actualFixed = actualTokens.filter((token) => {
      const item = itemByToken.get(token);
      return item?.ownerUnitId === unit.id && item.movement === "fixed-order";
    });
    const hasCompleteFixedSet =
      expectedFixed.length === actualFixed.length &&
      expectedFixed.every((token) => (actualCounts.get(token) ?? 0) === 1);
    if (hasCompleteFixedSet && expectedFixed.some((token, index) => token !== actualFixed[index])) {
      protectionFailed = true;
      add(
        "protection-order-mismatch",
        "error",
        "One or more fixed-order protected occurrences moved relative to each other.",
        unit.id,
      );
    }
  }
  checks.push({
    id: "protected-occurrences",
    status:
      input.extraction.protectedItems.length === 0
        ? "not-applicable"
        : protectionFailed
          ? "fail"
          : "pass",
    detail:
      input.extraction.protectedItems.length === 0
        ? "The extraction contains no protected occurrences."
        : protectionFailed
          ? "At least one occurrence identity, count, ownership, introduction, or order rule failed."
          : "All declared occurrences satisfy identity, count, ownership, introduction, and movement rules.",
  });

  let emptyFailed = false;
  for (const unit of input.extraction.units) {
    const replacement = replacementGroups.get(unit.id)?.[0];
    if (replacement && replacement.text.trim() === "") {
      emptyFailed = true;
      add("empty-target-unit", "error", `Target text is empty for ${unit.id}.`, unit.id);
    }
  }
  checks.push({
    id: "nonempty-targets",
    status: input.extraction.units.length === 0 ? "not-applicable" : emptyFailed ? "fail" : "pass",
    detail:
      input.extraction.units.length === 0
        ? "There are no selected units."
        : emptyFailed
          ? "At least one selected unit has empty target text."
          : "Every returned selected unit has nonempty target text.",
  });

  const unchangedPolicy = input.unchangedPolicy ?? "review";
  const unchangedUnits = input.extraction.units.filter((unit) => {
    const replacement = replacementGroups.get(unit.id)?.[0];
    return replacement?.text === unit.template;
  });
  for (const unit of unchangedUnits) {
    if (unchangedPolicy !== "allow") {
      add(
        "unchanged-target-unit",
        unchangedPolicy === "fail" ? "error" : "warning",
        "Target text is exactly the selected source template; this is detectable but not sufficient to judge translation quality.",
        unit.id,
      );
    }
  }
  checks.push({
    id: "unchanged-targets",
    status:
      input.extraction.units.length === 0
        ? "not-applicable"
        : unchangedUnits.length === 0 || unchangedPolicy === "allow"
          ? "pass"
          : unchangedPolicy === "fail"
            ? "fail"
            : "unknown",
    detail:
      unchangedUnits.length === 0
        ? "No returned unit is an exact source-template copy."
        : `${unchangedUnits.length} unit(s) are exact copies under policy ${unchangedPolicy}.`,
  });

  const profiles = Object.entries(input.messageProfiles ?? {});
  let messageFailed = false;
  for (const [unitId, profile] of profiles) {
    const unit = unitById.get(unitId);
    const replacement = replacementGroups.get(unitId)?.[0];
    if (!unit) {
      messageFailed = true;
      add("unknown-message-profile-unit", "error", `Message profile references unknown unit ${unitId}.`, unitId);
      continue;
    }
    if (profile !== "classic-icu") {
      messageFailed = true;
      add("unsupported-message-profile", "error", `Message profile ${profile} is not implemented.`, unitId);
      continue;
    }
    if (!replacement) continue;
    try {
      const sourceAst = parseIcuMessage(unit.sourceSlice, { captureLocation: false });
      const targetAst = parseIcuMessage(expandProtectedTokens(replacement.text, unit, itemById), {
        captureLocation: false,
      });
      if (canonicalIcuElements(sourceAst) !== canonicalIcuElements(targetAst)) {
        messageFailed = true;
        add(
          "icu-structure-mismatch",
          "error",
          "Classic ICU argument, plural/select branch, or pound structure differs from the source.",
          unit.id,
        );
      }
    } catch (error) {
      messageFailed = true;
      add(
        "invalid-icu-message",
        "error",
        `Classic ICU parsing failed: ${error instanceof Error ? error.message : String(error)}`,
        unit.id,
      );
    }
  }
  checks.push({
    id: "message-profile",
    status: profiles.length === 0 ? "not-applicable" : messageFailed ? "fail" : "pass",
    detail:
      profiles.length === 0
        ? "No message grammar profile was selected."
        : messageFailed
          ? "At least one selected message profile failed parsing or structural comparison."
          : "All selected classic ICU messages parsed and retained their non-literal structure.",
  });

  return {
    deterministicStatus: diagnostics.some((diagnostic) => diagnostic.severity === "error")
      ? "fail"
      : "pass",
    checks,
    diagnostics,
    semanticReview: "required",
  };
}
