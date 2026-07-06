# Skill IR Parser

## Purpose

The Skill IR parser turns an LLM-produced or manually written JSON candidate into a validated `SkillIR`. It is the first cleanup layer between untrusted structured extraction and the rest of the IR pipeline.

The parser is implemented in:

```text
src/skill-ir/parser.ts
```

Focused tests are implemented in:

```text
src/skill-ir/parser.test.ts
```

## Responsibilities

The parser currently has two responsibilities:

1. Build a strict extraction prompt for LLM-assisted Skill IR construction.
2. Deterministically clean a JSON candidate before passing it to `SkillIRSchema.parse`.

The parser does not infer deep skill semantics by itself. It expects an upstream extractor, human author, or later LLM provider integration to produce a candidate with the expected top-level shape.

## Public API

```ts
parseSkillIRFromJsonCandidate(candidate: unknown): SkillIR
```

This function:

- Clones the input candidate.
- Trims top-level `id`, `name`, and `intent`.
- Fills empty step ids from step titles.
- Fills empty rule ids from normalized forms, source text, or index fallback.
- Deduplicates step and rule ids with numeric suffixes.
- Runs `SkillIRSchema.parse` before returning.

```ts
buildSkillIRExtractionPrompt(skillText: string): string
```

This function builds a prompt that asks an LLM to emit strict JSON matching `skill-ir/v1`, without markdown fences.

## Runtime Flow

Expected usage:

```ts
const prompt = buildSkillIRExtractionPrompt(skillText);
const candidate = await model.extractJson(prompt);
const ir = parseSkillIRFromJsonCandidate(candidate);
```

The returned `ir` is safe to pass to:

```text
src/skill-ir/validate.ts
src/skill-ir/passes/*
src/skill-ir/lowering/*
```

## Deterministic Cleanup Rules

Step id cleanup:

```text
title "Read files" -> step-read-files
```

Rule id cleanup:

```text
normalizedForm "Output begins with findings." -> rule-output-begins-with-findings
```

Duplicate cleanup:

```text
step-read-files
step-read-files-2
step-read-files-3
```

The parser preserves existing non-empty ids unless they collide with a previous id.

## Command Line

Run focused parser tests:

```powershell
bun test ./src/skill-ir/parser.test.ts
```

Run all current Skill IR unit tests:

```powershell
bun test ./src/skill-ir/schema.test.ts ./src/skill-ir/validate.test.ts ./src/skill-ir/parser.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Failure Modes

- Passing an object that is not shaped like `SkillIR` can fail before schema parsing because deterministic cleanup expects `id`, `name`, `intent`, `steps`, and `rules`.
- Parser cleanup only handles step and rule ids. Tool, check, recovery, and profile ids will be normalized in later work if corpus examples show the need.
- The prompt builder does not call an LLM. It only builds a prompt string.
- The parser validates shape, not semantic cross-references. Run `validateSkillIR` after parsing.

## Modification Notes

- Add tests before adding new cleanup rules.
- Keep cleanup deterministic so repeated extraction candidates produce stable IR.
- Do not silently invent missing semantic content. Fill mechanical ids, but leave absent steps, rules, tools, or checks to extraction and validation.
- If parser behavior changes, update this document and any corpus examples affected by the new normalization behavior.
