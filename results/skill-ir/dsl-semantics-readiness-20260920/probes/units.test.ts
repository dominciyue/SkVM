import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ProbeError,
  applyUnitReplacements,
  extractMarkdownDocuments,
  resolveProtectedCandidates,
  serializeMarkdownAst,
  type DocumentInput,
} from "./units.ts";

const fixtures = join(import.meta.dir, "fixtures");

function doc(id: string, source: string, path = `${id}.md`): DocumentInput {
  return { id, path, bytes: Buffer.from(source, "utf8") };
}

function unchangedReplacements(extraction: ReturnType<typeof extractMarkdownDocuments>) {
  return extraction.units.map((unit: { id: string; template: string }) => ({
    unitId: unit.id,
    text: unit.template,
  }));
}

function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProbeError) return error.code;
    throw error;
  }
  throw new Error("expected ProbeError");
}

describe("D5 roundtrip strategy comparison", () => {
  test("source-coordinate refill is byte exact where regeneration and AST serialization are not", () => {
    const source = Buffer.from(
      "---\r\nname: demo\r\ndescription: Hello  \r\n---\r\n# Hello\r\n\r\n中文 😀  \r\n",
      "utf8",
    );
    const extraction = extractMarkdownDocuments([{ id: "doc", path: "demo.md", bytes: source }]);
    const local = applyUnitReplacements(extraction, unchangedReplacements(extraction)).get("doc");
    const wholeDocumentCandidate = Buffer.from(
      source.toString("utf8").replaceAll("\r\n", "\n").replaceAll("  \n", "\n"),
      "utf8",
    );
    const serialized = serializeMarkdownAst(source);

    expect(Buffer.from(local!)).toEqual(source);
    expect(wholeDocumentCandidate).not.toEqual(source);
    expect(Buffer.from(serialized)).not.toEqual(source);
  });
});

describe("D5 unit identity and extraction", () => {
  test("nested and repeated text receives distinct snapshot-scoped IDs", () => {
    const source = "# Repeat\n\n- Repeat\n  - Repeat\n\n> Repeat\n";
    const extraction = extractMarkdownDocuments([doc("nested", source)]);
    const repeated = extraction.units.filter((unit: { sourceSlice: string }) =>
      unit.sourceSlice.includes("Repeat"),
    );
    expect(repeated.length).toBeGreaterThanOrEqual(4);
    expect(new Set(repeated.map((unit: { id: string }) => unit.id)).size).toBe(repeated.length);
  });

  test("same text in two files has document-distinct IDs", () => {
    const extraction = extractMarkdownDocuments([
      doc("a", "# Same\n\nSame text.\n", "a.md"),
      doc("b", "# Same\n\nSame text.\n", "b.md"),
    ]);
    const aIds = extraction.units.filter((u: { documentId: string }) => u.documentId.startsWith("a:"));
    const bIds = extraction.units.filter((u: { documentId: string }) => u.documentId.startsWith("b:"));
    expect(aIds.map((u: { id: string }) => u.id)).not.toEqual(bIds.map((u: { id: string }) => u.id));
  });

  test("changed source versions do not promise stable unit IDs", () => {
    const before = extractMarkdownDocuments([doc("v", "# Title\n\nText.\n")]);
    const after = extractMarkdownDocuments([doc("v", "# Title\n\nChanged text.\n")]);
    expect(before.units.map((u: { id: string }) => u.id)).not.toEqual(
      after.units.map((u: { id: string }) => u.id),
    );
  });

  test("GFM table cells are units and raw HTML is explicitly unsupported", () => {
    const table = extractMarkdownDocuments([
      doc("table", "| Name | Meaning |\n| --- | --- |\n| API | Interface |\n"),
    ]);
    expect(table.units.filter((u: { kind: string }) => u.kind === "table-cell").length).toBe(4);

    const html = extractMarkdownDocuments([
      { id: "html", path: "unsupported-html.md", bytes: readFileSync(join(fixtures, "unsupported-html.md")) },
    ]);
    expect(html.supported).toBe(false);
    expect(html.diagnostics.map((d: { code: string }) => d.code)).toContain("unsupported-structure");
  });

  test("code-only supported Markdown yields zero editable units without becoming out-of-task", () => {
    const extraction = extractMarkdownDocuments([
      { id: "code", path: "code-only.md", bytes: readFileSync(join(fixtures, "code-only.md")) },
    ]);
    expect(extraction.supported).toBe(true);
    expect(extraction.units).toHaveLength(0);
    expect(extraction.protectedItems.length).toBeGreaterThan(0);
  });
});

describe("D5 protection identity and refill", () => {
  test("duplicate inline code occurrences remain unit-bound", () => {
    const extraction = extractMarkdownDocuments([
      doc("dup", "First `x` text.\n\nSecond `x` text.\n"),
    ]);
    const codes = extraction.protectedItems.filter((item: { kind: string }) => item.kind === "inline-code");
    expect(codes).toHaveLength(2);
    const firstCode = codes[0]!;
    const secondCode = codes[1]!;
    expect(firstCode.sourceText).toBe(secondCode.sourceText);
    expect(firstCode.id).not.toBe(secondCode.id);
    expect(firstCode.ownerUnitId).not.toBe(secondCode.ownerUnitId);

    const replacements = unchangedReplacements(extraction);
    const second = replacements.find((replacement: { unitId: string }) => replacement.unitId === secondCode.ownerUnitId)!;
    second.text = second.text.replace(secondCode.token, firstCode.token);
    expect(errorCode(() => applyUnitReplacements(extraction, replacements))).toBe(
      "foreign-protection-token",
    );
  });

  test("link label is editable while its URL and Markdown skeleton remain exact", () => {
    const source = "Read [the docs](https://example.com/a?q=1) now.\n";
    const extraction = extractMarkdownDocuments([doc("link", source)]);
    const unit = extraction.units[0]!;
    const replacements = unchangedReplacements(extraction);
    const firstReplacement = replacements[0]!;
    firstReplacement.text = unit.template.replace("the docs", "文档");
    const result = Buffer.from(applyUnitReplacements(extraction, replacements).get("link")!).toString("utf8");
    expect(result).toBe("Read [文档](https://example.com/a?q=1) now.\n");
  });

  test("frontmatter name is protected while description is editable", () => {
    const input = readFileSync(join(fixtures, "direct-guide.md"));
    const extraction = extractMarkdownDocuments([{ id: "guide", path: "direct-guide.md", bytes: input }]);
    expect(extraction.units.some((u: { kind: string }) => u.kind === "frontmatter-description")).toBe(true);
    expect(
      extraction.protectedItems.some(
        (p: { kind: string; sourceText: string }) => p.kind === "frontmatter-name" && p.sourceText === "direct-guide",
      ),
    ).toBe(true);
    const replacements = unchangedReplacements(extraction);
    const description = extraction.units.find((u: { kind: string }) => u.kind === "frontmatter-description");
    expect(description).toBeDefined();
    const replacement = replacements.find((r: { unitId: string }) => r.unitId === description!.id)!;
    replacement.text = "安全重置演示 🚀";
    const output = Buffer.from(applyUnitReplacements(extraction, replacements).get("guide")!).toString("utf8");
    expect(output).toContain("name: direct-guide");
    expect(output).toContain("description: 安全重置演示 🚀");
  });

  test("overlapping protection candidates fail instead of guessing precedence", () => {
    expect(
      errorCode(() =>
        resolveProtectedCandidates([
          { start: 2, end: 8, kind: "url", sourceText: "abcdef" },
          { start: 5, end: 10, kind: "placeholder", sourceText: "defgh" },
        ]),
      ),
    ).toBe("protection-overlap");
  });
});

describe("D5 replacement contract and stale input", () => {
  test("wrong, duplicate, and missing unit results are distinct failures", () => {
    const extraction = extractMarkdownDocuments([doc("contract", "# Title\n\nBody.\n")]);
    const replacements = unchangedReplacements(extraction);
    const firstReplacement = replacements[0]!;
    expect(errorCode(() => applyUnitReplacements(extraction, [...replacements, { unitId: "unknown", text: "x" }]))).toBe(
      "unknown-unit-result",
    );
    expect(errorCode(() => applyUnitReplacements(extraction, [...replacements, firstReplacement]))).toBe(
      "duplicate-unit-result",
    );
    expect(errorCode(() => applyUnitReplacements(extraction, replacements.slice(1)))).toBe(
      "missing-unit-result",
    );
  });

  test("changed input blocks refill before any output is built", () => {
    const original = doc("stale", "# Title\n\nBody.\n");
    const extraction = extractMarkdownDocuments([original]);
    const changed = doc("stale", "# Title\n\nChanged.\n");
    expect(
      errorCode(() => applyUnitReplacements(extraction, unchangedReplacements(extraction), [changed])),
    ).toBe("stale-source-snapshot");
  });
});
