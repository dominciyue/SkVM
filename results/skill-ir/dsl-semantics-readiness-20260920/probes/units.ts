import { createHash } from "node:crypto";
import { unified } from "unified";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";

export interface DocumentInput {
  id: string;
  path: string;
  bytes: Uint8Array;
}

export interface ProtectedCandidate {
  start: number;
  end: number;
  kind: string;
  sourceText: string;
}

export type LexicalProtectionKind =
  | "url"
  | "placeholder"
  | "environment-variable"
  | "path"
  | "command";

export interface ExtractionOptions {
  lexicalKinds?: readonly LexicalProtectionKind[];
}

export interface UnitReplacement {
  unitId: string;
  text: string;
}

export interface SourceRange {
  textStart: number;
  textEnd: number;
  byteStart: number;
  byteEnd: number;
  line: number;
  column: number;
}

export interface ProtectedItem {
  id: string;
  documentId: string;
  ownerUnitId: string | null;
  kind: string;
  range: SourceRange;
  sourceText: string;
  sourceDigest: string;
  token: string;
  movement: "reorder-within-unit" | "fixed-order";
}

export interface SourceUnit {
  id: string;
  documentId: string;
  kind:
    | "frontmatter-description"
    | "heading"
    | "paragraph"
    | "blockquote-paragraph"
    | "list-item-paragraph"
    | "table-cell";
  structuralPath: string;
  range: SourceRange;
  sourceSlice: string;
  template: string;
  protectedItemIds: string[];
}

export interface ProbeDiagnostic {
  code: string;
  documentId: string;
  message: string;
  range?: SourceRange;
}

export interface ExtractedDocument {
  input: DocumentInput;
  documentId: string;
  digest: string;
  text: string;
  units: SourceUnit[];
  protectedItems: ProtectedItem[];
}

export interface ExtractionResult {
  supported: boolean;
  documents: ExtractedDocument[];
  units: SourceUnit[];
  protectedItems: ProtectedItem[];
  diagnostics: ProbeDiagnostic[];
}

export class ProbeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ProbeError";
  }
}

interface AstPosition {
  start: { line: number; column: number; offset?: number };
  end: { line: number; column: number; offset?: number };
}

interface AstNode {
  type: string;
  value?: string;
  url?: string;
  children?: AstNode[];
  position?: AstPosition;
}

interface NodeRecord {
  node: AstNode;
  path: string;
  ancestors: AstNode[];
}

interface UnitDraft {
  kind: SourceUnit["kind"];
  structuralPath: string;
  start: number;
  end: number;
  candidates: ProtectedCandidate[];
}

const TOKEN_PATTERN = /⟦p:[^⟧]+⟧/gu;

export function findProtectionTokens(text: string): string[] {
  return [...text.matchAll(TOKEN_PATTERN)].map((match) => match[0]);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new ProbeError("invalid-utf8", "Markdown input is not valid UTF-8");
  }
}

function parser() {
  return unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkGfm);
}

function positionRange(node: AstNode): { start: number; end: number } | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return null;
  return { start, end };
}

function sourceRange(text: string, start: number, end: number): SourceRange {
  const prefix = text.slice(0, start);
  const lastNewline = prefix.lastIndexOf("\n");
  return {
    textStart: start,
    textEnd: end,
    byteStart: Buffer.byteLength(prefix, "utf8"),
    byteEnd: Buffer.byteLength(text.slice(0, end), "utf8"),
    line: prefix.split("\n").length,
    column: start - lastNewline,
  };
}

function walk(node: AstNode, path: string, ancestors: AstNode[], records: NodeRecord[]): void {
  records.push({ node, path, ancestors });
  node.children?.forEach((child, index) =>
    walk(child, `${path}/${child.type}[${index}]`, [...ancestors, node], records),
  );
}

function editableTextRecords(container: AstNode): AstNode[] {
  const result: AstNode[] = [];
  const visit = (node: AstNode, blocked: boolean): void => {
    const nextBlocked =
      blocked ||
      node.type === "inlineCode" ||
      node.type === "code" ||
      node.type === "html" ||
      node.type === "image" ||
      node.type === "imageReference";
    if (node.type === "text" && !nextBlocked && positionRange(node)) result.push(node);
    node.children?.forEach((child) => visit(child, nextBlocked));
  };
  visit(container, false);
  return result;
}

function linkSyntaxRanges(container: AstNode): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  const visit = (node: AstNode): void => {
    if (node.type === "link" || node.type === "linkReference") {
      const outer = positionRange(node);
      const childRanges = (node.children ?? [])
        .map(positionRange)
        .filter((range): range is { start: number; end: number } => range !== null)
        .sort((a, b) => a.start - b.start);
      if (outer && childRanges.length > 0) {
        const first = childRanges[0]!;
        const last = childRanges[childRanges.length - 1]!;
        if (outer.start < first.start) result.push({ start: outer.start, end: first.start });
        if (last.end < outer.end) result.push({ start: last.end, end: outer.end });
      }
    }
    node.children?.forEach(visit);
  };
  visit(container);
  return result;
}

function syntaxNodeRanges(container: AstNode): Array<{ start: number; end: number; kind: string }> {
  const result: Array<{ start: number; end: number; kind: string }> = [];
  const visit = (node: AstNode): void => {
    if (["inlineCode", "image", "imageReference", "break"].includes(node.type)) {
      const range = positionRange(node);
      if (range) result.push({ ...range, kind: node.type === "inlineCode" ? "inline-code" : "markdown-inline" });
      return;
    }
    node.children?.forEach(visit);
  };
  visit(container);
  return result;
}

const LEXICAL_PATTERNS: Array<{ kind: LexicalProtectionKind; regex: RegExp }> = [
  { kind: "url", regex: /https?:\/\/[^\s<>"')\]}]+/gu },
  { kind: "placeholder", regex: /\{\{[^{}\r\n]+\}\}|\{[A-Za-z_][A-Za-z0-9_.-]*\}|%(?:\d+\$)?[A-Za-z]/gu },
  { kind: "environment-variable", regex: /\$[A-Z_][A-Z0-9_]*/gu },
  { kind: "path", regex: /(?:~\/|\.\.?\/)[A-Za-z0-9_.~\/-]+/gu },
  { kind: "command", regex: /\/[a-z][a-z0-9-]*/gu },
];

const ALL_LEXICAL_KINDS = LEXICAL_PATTERNS.map((pattern) => pattern.kind);

function lexicalCandidates(
  text: string,
  start: number,
  end: number,
  lexicalKinds: readonly LexicalProtectionKind[],
): ProtectedCandidate[] {
  const slice = text.slice(start, end);
  const candidates: ProtectedCandidate[] = [];
  for (const { kind, regex } of LEXICAL_PATTERNS) {
    if (!lexicalKinds.includes(kind)) continue;
    regex.lastIndex = 0;
    for (const match of slice.matchAll(regex)) {
      const matchStart = start + (match.index ?? 0);
      const matchEnd = matchStart + match[0].length;
      if (candidates.some((candidate) => matchStart < candidate.end && matchEnd > candidate.start)) continue;
      candidates.push({ start: matchStart, end: matchEnd, kind, sourceText: match[0] });
    }
  }
  return candidates;
}

export function scanLexicalProtections(
  text: string,
  lexicalKinds: readonly LexicalProtectionKind[] = ALL_LEXICAL_KINDS,
): ProtectedCandidate[] {
  return lexicalCandidates(text, 0, text.length, lexicalKinds);
}

function protectionMovement(
  candidate: Pick<ProtectedCandidate, "kind" | "sourceText">,
): ProtectedItem["movement"] {
  if (
    candidate.kind === "placeholder" &&
    (/^\{[A-Za-z_][A-Za-z0-9_.-]*\}$/u.test(candidate.sourceText) ||
      /^\{\{[^{}\r\n]+\}\}$/u.test(candidate.sourceText))
  ) {
    return "reorder-within-unit";
  }
  return "fixed-order";
}

export function resolveProtectedCandidates(candidates: ProtectedCandidate[]): ProtectedCandidate[] {
  const sorted = [...candidates].sort((a, b) => a.start - b.start || a.end - b.end || a.kind.localeCompare(b.kind));
  const resolved: ProtectedCandidate[] = [];
  for (const candidate of sorted) {
    if (candidate.start < 0 || candidate.end <= candidate.start) {
      throw new ProbeError("invalid-protection-range", `Invalid protection range ${candidate.start}:${candidate.end}`);
    }
    const previous = resolved[resolved.length - 1];
    if (!previous || candidate.start >= previous.end) {
      resolved.push(candidate);
      continue;
    }
    if (
      candidate.start === previous.start &&
      candidate.end === previous.end &&
      candidate.sourceText === previous.sourceText
    ) {
      continue;
    }
    throw new ProbeError(
      "protection-overlap",
      `Protection ranges overlap: ${previous.start}:${previous.end} and ${candidate.start}:${candidate.end}`,
    );
  }
  return resolved;
}

function paragraphKind(ancestors: AstNode[]): SourceUnit["kind"] {
  if (ancestors.some((node) => node.type === "blockquote")) return "blockquote-paragraph";
  if (ancestors.some((node) => node.type === "listItem")) return "list-item-paragraph";
  return "paragraph";
}

function buildBlockDraft(
  record: NodeRecord,
  text: string,
  lexicalKinds: readonly LexicalProtectionKind[],
): UnitDraft | null {
  const { node, ancestors } = record;
  let kind: SourceUnit["kind"];
  if (node.type === "heading") kind = "heading";
  else if (node.type === "paragraph") kind = paragraphKind(ancestors);
  else if (node.type === "tableCell") kind = "table-cell";
  else return null;

  const editable = editableTextRecords(node)
    .map(positionRange)
    .filter((range): range is { start: number; end: number } => range !== null)
    .sort((a, b) => a.start - b.start);
  if (editable.length === 0) return null;

  const start = editable[0]!.start;
  const end = editable[editable.length - 1]!.end;
  const syntaxNodes = syntaxNodeRanges(node);
  const linkSyntax = linkSyntaxRanges(node);
  const candidates: ProtectedCandidate[] = [];

  for (let index = 0; index < editable.length - 1; index += 1) {
    const gapStart = editable[index]!.end;
    const gapEnd = editable[index + 1]!.start;
    if (gapStart >= gapEnd) continue;
    const exactSyntax = syntaxNodes.find((range) => range.start === gapStart && range.end === gapEnd);
    const isLinkSyntax = linkSyntax.some((range) => gapStart < range.end && gapEnd > range.start);
    candidates.push({
      start: gapStart,
      end: gapEnd,
      kind: exactSyntax?.kind ?? (isLinkSyntax ? "link-destination" : "markdown-inline"),
      sourceText: text.slice(gapStart, gapEnd),
    });
  }

  for (const range of editable) {
    candidates.push(...lexicalCandidates(text, range.start, range.end, lexicalKinds));
  }

  return {
    kind,
    structuralPath: record.path,
    start,
    end,
    candidates: resolveProtectedCandidates(candidates),
  };
}

function frontmatterDrafts(
  node: AstNode,
  text: string,
  lexicalKinds: readonly LexicalProtectionKind[],
): { units: UnitDraft[]; protections: ProtectedCandidate[] } {
  const range = positionRange(node);
  if (!range) return { units: [], protections: [] };
  const raw = text.slice(range.start, range.end);
  const units: UnitDraft[] = [];
  const protections: ProtectedCandidate[] = [];
  const field = /^(name|description):[ \t]*(.*?)[ \t]*\r?$/gmu;
  for (const match of raw.matchAll(field)) {
    const key = match[1]!;
    const value = match[2] ?? "";
    if (!value) continue;
    const valueInLine = match[0].indexOf(value);
    const start = range.start + (match.index ?? 0) + valueInLine;
    const end = start + value.length;
    if (key === "description") {
      units.push({
        kind: "frontmatter-description",
        structuralPath: "root/yaml[0]/description",
        start,
        end,
        candidates: lexicalCandidates(text, start, end, lexicalKinds),
      });
    } else {
      protections.push({ start, end, kind: "frontmatter-name", sourceText: value });
    }
  }
  return { units, protections };
}

function protectedToken(documentId: string, unitOrdinal: number, itemOrdinal: number, candidate: ProtectedCandidate): string {
  const suffix = sha256(`${candidate.start}:${candidate.end}:${candidate.sourceText}`).slice(0, 8);
  return `⟦p:${documentId}:${unitOrdinal}:${itemOrdinal}:${suffix}⟧`;
}

function buildDocument(
  input: DocumentInput,
  lexicalKinds: readonly LexicalProtectionKind[],
): { document: ExtractedDocument; diagnostics: ProbeDiagnostic[] } {
  const text = decodeUtf8(input.bytes);
  const digest = sha256(input.bytes);
  const documentId = `${input.id}:${digest.slice(0, 12)}`;
  const tree = parser().parse(text) as AstNode;
  const records: NodeRecord[] = [];
  walk(tree, "root", [], records);
  const diagnostics: ProbeDiagnostic[] = [];
  const drafts: UnitDraft[] = [];
  const globalCandidates: ProtectedCandidate[] = [];

  for (const record of records) {
    if (record.node.type === "html") {
      const range = positionRange(record.node);
      diagnostics.push({
        code: "unsupported-structure",
        documentId,
        message: "Raw HTML/MDX-like nodes are outside commonmark-gfm-frontmatter/v0.",
        range: range ? sourceRange(text, range.start, range.end) : undefined,
      });
    }
    if (record.node.type === "yaml") {
      const frontmatter = frontmatterDrafts(record.node, text, lexicalKinds);
      drafts.push(...frontmatter.units);
      globalCandidates.push(...frontmatter.protections);
    }
    const draft = buildBlockDraft(record, text, lexicalKinds);
    if (draft) drafts.push(draft);
  }

  drafts.sort((a, b) => a.start - b.start || a.end - b.end || a.structuralPath.localeCompare(b.structuralPath));
  for (let index = 1; index < drafts.length; index += 1) {
    const previous = drafts[index - 1]!;
    const current = drafts[index]!;
    if (current.start < previous.end) {
      throw new ProbeError(
        "unit-overlap",
        `Editable units overlap in ${input.path}: ${previous.structuralPath} and ${current.structuralPath}`,
      );
    }
  }

  const units: SourceUnit[] = [];
  const protectedItems: ProtectedItem[] = [];
  drafts.forEach((draft, unitOrdinal) => {
    const sourceSlice = text.slice(draft.start, draft.end);
    const id = `${documentId}:${draft.kind}:${unitOrdinal}:${sha256(sourceSlice).slice(0, 8)}`;
    const items = draft.candidates.map((candidate, itemOrdinal): ProtectedItem => {
      const token = protectedToken(documentId, unitOrdinal, itemOrdinal, candidate);
      return {
        id: `${id}:p${itemOrdinal}`,
        documentId,
        ownerUnitId: id,
        kind: candidate.kind,
        range: sourceRange(text, candidate.start, candidate.end),
        sourceText: candidate.sourceText,
        sourceDigest: `sha256:${sha256(candidate.sourceText)}`,
        token,
        movement: protectionMovement(candidate),
      };
    });
    let template = sourceSlice;
    [...items]
      .sort((a, b) => b.range.textStart - a.range.textStart)
      .forEach((item) => {
        const relativeStart = item.range.textStart - draft.start;
        const relativeEnd = item.range.textEnd - draft.start;
        template = `${template.slice(0, relativeStart)}${item.token}${template.slice(relativeEnd)}`;
      });
    units.push({
      id,
      documentId,
      kind: draft.kind,
      structuralPath: draft.structuralPath,
      range: sourceRange(text, draft.start, draft.end),
      sourceSlice,
      template,
      protectedItemIds: items.map((item) => item.id),
    });
    protectedItems.push(...items);
  });

  const covered = (start: number, end: number) =>
    protectedItems.some((item) => item.range.textStart === start && item.range.textEnd === end);
  for (const record of records) {
    if (!["code", "inlineCode", "image", "imageReference"].includes(record.node.type)) continue;
    const range = positionRange(record.node);
    if (!range || covered(range.start, range.end)) continue;
    globalCandidates.push({
      start: range.start,
      end: range.end,
      kind:
        record.node.type === "code"
          ? "code-block"
          : record.node.type === "inlineCode"
            ? "inline-code"
            : "markdown-inline",
      sourceText: text.slice(range.start, range.end),
    });
  }

  const resolvedGlobal = resolveProtectedCandidates(globalCandidates);
  resolvedGlobal.forEach((candidate, index) => {
    protectedItems.push({
      id: `${documentId}:document:p${index}`,
      documentId,
      ownerUnitId: null,
      kind: candidate.kind,
      range: sourceRange(text, candidate.start, candidate.end),
      sourceText: candidate.sourceText,
      sourceDigest: `sha256:${sha256(candidate.sourceText)}`,
      token: protectedToken(documentId, -1, index, candidate),
      movement: protectionMovement(candidate),
    });
  });

  return {
    document: {
      input: { ...input, bytes: Uint8Array.from(input.bytes) },
      documentId,
      digest,
      text,
      units,
      protectedItems,
    },
    diagnostics,
  };
}

export function extractMarkdownDocuments(
  inputs: DocumentInput[],
  options: ExtractionOptions = {},
): ExtractionResult {
  if (inputs.length === 0) throw new ProbeError("missing-input", "At least one Markdown input is required");
  const ids = new Set<string>();
  const documents: ExtractedDocument[] = [];
  const diagnostics: ProbeDiagnostic[] = [];
  for (const input of inputs) {
    if (ids.has(input.id)) throw new ProbeError("duplicate-document-id", `Duplicate document id: ${input.id}`);
    ids.add(input.id);
    const built = buildDocument(input, options.lexicalKinds ?? ALL_LEXICAL_KINDS);
    documents.push(built.document);
    diagnostics.push(...built.diagnostics);
  }
  return {
    supported: !diagnostics.some((diagnostic) => diagnostic.code === "unsupported-structure"),
    documents,
    units: documents.flatMap((document) => document.units),
    protectedItems: documents.flatMap((document) => document.protectedItems),
    diagnostics,
  };
}

function validateReplacementTokens(
  replacement: UnitReplacement,
  unit: SourceUnit,
  itemByToken: Map<string, ProtectedItem>,
  itemById: Map<string, ProtectedItem>,
): void {
  const actual = findProtectionTokens(replacement.text);
  const actualCounts = new Map<string, number>();
  actual.forEach((token) => actualCounts.set(token, (actualCounts.get(token) ?? 0) + 1));
  const expected = unit.protectedItemIds.map((id) => {
    const item = itemById.get(id);
    if (!item) throw new ProbeError("internal-manifest-error", `Missing protected item ${id}`);
    return item.token;
  });

  for (const token of actual) {
    const item = itemByToken.get(token);
    if (!item) throw new ProbeError("unknown-protection-token", `Unknown protection token in ${unit.id}`);
    if (item.ownerUnitId !== unit.id) {
      throw new ProbeError("foreign-protection-token", `Protection token from ${item.ownerUnitId} used in ${unit.id}`);
    }
  }
  for (const token of expected) {
    const count = actualCounts.get(token) ?? 0;
    if (count === 0) throw new ProbeError("missing-protection-token", `Missing protection token in ${unit.id}`);
    if (count > 1) throw new ProbeError("duplicate-protection-token", `Duplicate protection token in ${unit.id}`);
  }
}

export function applyUnitReplacements(
  extraction: ExtractionResult,
  replacements: UnitReplacement[],
  currentInputs?: DocumentInput[],
): Map<string, Uint8Array> {
  const unitById = new Map(extraction.units.map((unit) => [unit.id, unit]));
  const replacementByUnit = new Map<string, UnitReplacement>();
  for (const replacement of replacements) {
    if (!unitById.has(replacement.unitId)) {
      throw new ProbeError("unknown-unit-result", `Unknown unit result: ${replacement.unitId}`);
    }
    if (replacementByUnit.has(replacement.unitId)) {
      throw new ProbeError("duplicate-unit-result", `Duplicate unit result: ${replacement.unitId}`);
    }
    replacementByUnit.set(replacement.unitId, replacement);
  }
  const missing = extraction.units.find((unit) => !replacementByUnit.has(unit.id));
  if (missing) throw new ProbeError("missing-unit-result", `Missing unit result: ${missing.id}`);

  const effectiveInputs = currentInputs ?? extraction.documents.map((document) => document.input);
  const currentById = new Map(effectiveInputs.map((input) => [input.id, input]));
  for (const document of extraction.documents) {
    const current = currentById.get(document.input.id);
    if (!current || sha256(current.bytes) !== document.digest) {
      throw new ProbeError("stale-source-snapshot", `Source changed after extraction: ${document.input.path}`);
    }
  }

  const itemByToken = new Map(extraction.protectedItems.map((item) => [item.token, item]));
  const itemById = new Map(extraction.protectedItems.map((item) => [item.id, item]));
  for (const replacement of replacements) {
    validateReplacementTokens(replacement, unitById.get(replacement.unitId)!, itemByToken, itemById);
  }

  const outputs = new Map<string, Uint8Array>();
  for (const document of extraction.documents) {
    let output = document.text;
    const replacementsForDocument = document.units
      .map((unit) => ({ unit, replacement: replacementByUnit.get(unit.id)! }))
      .sort((a, b) => b.unit.range.textStart - a.unit.range.textStart);
    for (const { unit, replacement } of replacementsForDocument) {
      let expanded = replacement.text;
      for (const itemId of unit.protectedItemIds) {
        const item = itemById.get(itemId)!;
        expanded = expanded.replace(item.token, item.sourceText);
      }
      output = `${output.slice(0, unit.range.textStart)}${expanded}${output.slice(unit.range.textEnd)}`;
    }
    outputs.set(document.input.id, Buffer.from(output, "utf8"));
  }
  return outputs;
}

export function serializeMarkdownAst(bytes: Uint8Array): Uint8Array {
  const text = decodeUtf8(bytes);
  const processor = parser().use(remarkStringify);
  const tree = processor.parse(text);
  return Buffer.from(processor.stringify(tree), "utf8");
}
