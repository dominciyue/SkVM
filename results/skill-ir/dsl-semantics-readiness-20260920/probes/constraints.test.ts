import { describe, expect, test } from "bun:test";
import {
  validateTranslationConstraints,
  type ConstraintValidationInput,
} from "./constraints";
import {
  extractMarkdownDocuments,
  type ExtractionResult,
  type UnitReplacement,
} from "./units";

function extract(source: string): ExtractionResult {
  return extractMarkdownDocuments([
    { id: "guide", path: "guide.md", bytes: Buffer.from(source, "utf8") },
  ]);
}

function unchanged(extraction: ExtractionResult): UnitReplacement[] {
  return extraction.units.map((unit) => ({ unitId: unit.id, text: unit.template }));
}

function input(
  extraction: ExtractionResult,
  replacements: UnitReplacement[] = unchanged(extraction),
  overrides: Partial<ConstraintValidationInput> = {},
): ConstraintValidationInput {
  return {
    extraction,
    replacements,
    requestedTargetLocales: ["zh-CN"],
    targetLocale: "zh-CN",
    selectionCompleteness: { status: "unknown", reason: "No independent selector audit." },
    ...overrides,
  };
}

function codes(result: ReturnType<typeof validateTranslationConstraints>): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function check(
  result: ReturnType<typeof validateTranslationConstraints>,
  id: ReturnType<typeof validateTranslationConstraints>["checks"][number]["id"],
) {
  return result.checks.find((candidate) => candidate.id === id)!;
}

describe("D6 protected occurrence constraints", () => {
  test("missing, duplicated, and newly introduced placeholders are distinct errors", () => {
    const extraction = extract("Hello {name}, you have {count} items.\n");
    const unit = extraction.units[0]!;
    const items = extraction.protectedItems.filter((item) => item.ownerUnitId === unit.id);
    const [name, count] = items;
    expect(name).toBeDefined();
    expect(count).toBeDefined();

    const missing = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: `你好 ${name!.token}` }]),
    );
    expect(codes(missing)).toContain("missing-protection-token");

    const duplicated = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: `${name!.token} ${count!.token} ${count!.token}` }]),
    );
    expect(codes(duplicated)).toContain("duplicate-protection-token");

    const introduced = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: `${name!.token} ${count!.token} {extra}` }]),
    );
    expect(codes(introduced)).toContain("untracked-protected-content");
  });

  test("a placeholder occurrence from another unit is not interchangeable", () => {
    const extraction = extract("First {one}.\n\nSecond {two}.\n");
    const [firstUnit, secondUnit] = extraction.units;
    const firstItem = extraction.protectedItems.find((item) => item.ownerUnitId === firstUnit!.id)!;
    const secondItem = extraction.protectedItems.find((item) => item.ownerUnitId === secondUnit!.id)!;
    const replacements = unchanged(extraction);
    replacements[0] = { unitId: firstUnit!.id, text: `甲 ${secondItem.token}` };
    replacements[1] = { unitId: secondUnit!.id, text: `乙 ${firstItem.token}` };

    const result = validateTranslationConstraints(input(extraction, replacements));
    expect(codes(result)).toContain("foreign-protection-token");
    expect(result.deterministicStatus).toBe("fail");
  });

  test("named placeholders may reorder within a unit", () => {
    const extraction = extract("Hello {first}, meet {second}.\n");
    const unit = extraction.units[0]!;
    const [first, second] = extraction.protectedItems.filter((item) => item.ownerUnitId === unit.id);
    const result = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: `${second!.token} 见到 ${first!.token}` }]),
    );

    expect(result.deterministicStatus).toBe("pass");
    expect(check(result, "protected-occurrences").status).toBe("pass");
  });

  test("positional placeholders may not reorder", () => {
    const extraction = extract("User %1$s has %2$d items.\n");
    const unit = extraction.units[0]!;
    const [first, second] = extraction.protectedItems.filter((item) => item.ownerUnitId === unit.id);
    const result = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: `${second!.token} 个项目属于 ${first!.token}` }]),
    );

    expect(codes(result)).toContain("protection-order-mismatch");
    expect(result.deterministicStatus).toBe("fail");
  });

  test("two link destinations cannot be swapped even though labels are editable", () => {
    const extraction = extract("Read [alpha](https://a.example) and [beta](https://b.example).\n");
    const unit = extraction.units[0]!;
    const links = extraction.protectedItems.filter(
      (item) =>
        item.ownerUnitId === unit.id &&
        item.kind === "link-destination" &&
        item.sourceText.includes("https://"),
    );
    expect(links).toHaveLength(2);
    const replacement = unit.template
      .replace(links[0]!.token, "TEMP_LINK")
      .replace(links[1]!.token, links[0]!.token)
      .replace("TEMP_LINK", links[1]!.token)
      .replace("alpha", "甲")
      .replace("beta", "乙");
    const result = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: replacement }]),
    );

    expect(codes(result)).toContain("protection-order-mismatch");
  });
});

describe("D6 target, coverage, and semantic boundary", () => {
  test("a missing or undeclared target locale is a deterministic failure", () => {
    const extraction = extract("Translate me.\n");
    const missing = validateTranslationConstraints(input(extraction, undefined, { targetLocale: null }));
    expect(codes(missing)).toContain("missing-target-locale");

    const undeclared = validateTranslationConstraints(
      input(extraction, undefined, { targetLocale: "ja", requestedTargetLocales: ["zh-CN"] }),
    );
    expect(codes(undeclared)).toContain("undeclared-target-locale");
  });

  test("empty target text fails, while exact source copy is separately reviewable", () => {
    const extraction = extract("Translate me.\n");
    const unit = extraction.units[0]!;
    const empty = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: "" }]),
    );
    expect(codes(empty)).toContain("empty-target-unit");
    expect(empty.deterministicStatus).toBe("fail");

    const copied = validateTranslationConstraints(input(extraction, unchanged(extraction)));
    expect(codes(copied)).toContain("unchanged-target-unit");
    expect(copied.deterministicStatus).toBe("pass");
    expect(copied.semanticReview).toBe("required");
  });

  test("complete returned-unit coverage does not prove selector completeness", () => {
    const extraction = extract("First sentence.\n\nSecond sentence.\n");
    const result = validateTranslationConstraints(input(extraction));
    expect(check(result, "selected-unit-coverage").status).toBe("pass");
    expect(check(result, "selection-completeness").status).toBe("unknown");

    const independentlyFailed = validateTranslationConstraints(
      input(extraction, undefined, {
        selectionCompleteness: {
          status: "failed",
          reason: "Independent source audit found an omitted caption.",
          missingSourceRanges: ["guide.md:20-31"],
        },
      }),
    );
    expect(check(independentlyFailed, "selected-unit-coverage").status).toBe("pass");
    expect(check(independentlyFailed, "selection-completeness").status).toBe("fail");
    expect(codes(independentlyFailed)).toContain("selection-incomplete");
  });

  test("zero protected occurrences are not-applicable rather than an extra pass", () => {
    const extraction = extract("Ordinary prose only.\n");
    const unit = extraction.units[0]!;
    const result = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: "只有普通文本。" }]),
    );
    expect(check(result, "protected-occurrences").status).toBe("not-applicable");
  });

  test("meaning can be wrong while all deterministic protections pass", () => {
    const extraction = extract("Delete account with `reset --all`.\n");
    const unit = extraction.units[0]!;
    const token = extraction.protectedItems.find((item) => item.ownerUnitId === unit.id)!.token;
    const result = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: `创建账户 ${token}。` }]),
    );
    expect(result.deterministicStatus).toBe("pass");
    expect(result.diagnostics).toHaveLength(0);
    expect(result.semanticReview).toBe("required");
  });
});

describe("D6 classic ICU profile", () => {
  test("the selected classic-icu profile parses plural/select structure", () => {
    const extraction = extract(
      "{gender, select, female {She has {count, plural, one {# file} other {# files}}} other {They have {count, plural, one {# file} other {# files}}}}\n",
    );
    const unit = extraction.units[0]!;
    const profiles = { [unit.id]: "classic-icu" };
    const valid = validateTranslationConstraints(
      input(
        extraction,
        [{
          unitId: unit.id,
          text: "{gender, select, other {{count, plural, other {# 个文件} one {# 个文件}} 他们有} female {{count, plural, other {# 个文件} one {# 个文件}} 她有}}",
        }],
        { messageProfiles: profiles },
      ),
    );
    expect(check(valid, "message-profile").status).toBe("pass");

    const missingBranch = validateTranslationConstraints(
      input(
        extraction,
        [{ unitId: unit.id, text: "{gender, select, female {她有文件} other {他们有文件}}" }],
        { messageProfiles: profiles },
      ),
    );
    expect(codes(missingBranch)).toContain("icu-structure-mismatch");
  });

  test("ICU syntax errors and unimplemented profiles are explicit", () => {
    const extraction = extract("Hello world.\n");
    const unit = extraction.units[0]!;
    const syntax = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: "{count, plural, one {x}" }], {
        messageProfiles: { [unit.id]: "classic-icu" },
      }),
    );
    expect(codes(syntax)).toContain("invalid-icu-message");

    const unsupported = validateTranslationConstraints(
      input(extraction, [{ unitId: unit.id, text: "Translated." }], {
        messageProfiles: { [unit.id]: "messageformat-2" },
      }),
    );
    expect(codes(unsupported)).toContain("unsupported-message-profile");
  });
});
