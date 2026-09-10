import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve, relative } from "node:path";
import { parseApiTesterOperationSource } from "../../src/skill-ir/api-tester-operation-source";
import { createResponseSchemaChecker } from "../../src/skill-ir/api-schema-checker";
import { checkApiResponseObservation } from "../../src/skill-ir/api-response-observation";
import { createContainedDirectory, resolveContainedExistingFile } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";

type Raw = Record<string, any>;
const object = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const pointer = (v: string) => v.replaceAll("~", "~0").replaceAll("/", "~1");
type ExampleRow = { locator: string; origin: "source-declared-example"; scope: string; status: "valid" | "invalid" | "unresolved"; detail: unknown };
type MediaRow = { mediaType: string; schemaStatus: string; schemaDiagnostics: unknown; issues: string[]; examples: ExampleRow[] };
type ResponseRow = { statusKey: string; locator: string; resolvedLocator: string | null; issues: string[]; headers: unknown; links: unknown; media: MediaRow[] };

export function analyzeResponseSchemas(source: string, format: "json" | "yaml") {
  const parsed = parseApiTesterOperationSource(source, format), document = parsed.document;
  if (!document || !/^3\.0\./u.test(String(document.openapi))) throw new Error("OpenAPI3.0 source required");
  const report = { sourceSha256: sha(source), format, enumerationComplete: parsed.enumeration.complete,
    enumerationIssues: parsed.enumeration.unresolved, operations: [] as Array<{ key: string; issues: string[]; responses: ResponseRow[] }>,
    totals: { operations: 0, responses: 0, media: 0, compiledSchemas: 0, validExamples: 0, invalidExamples: 0, unresolvedExamples: 0 },
    liveObservations: 0, wholeSkillCompleted: false, responseHeadersValidated: false, statusTriggersVerified: false };
  function resolveRef(raw: unknown, onReference?: (ref: string) => void): Raw {
    const seen = new Set<string>();
    while (object(raw) && Object.hasOwn(raw, "$ref")) {
      const ref = raw.$ref;
      if (typeof ref !== "string" || !ref.startsWith("#/") || seen.has(ref) || seen.size >= 32
        || Object.keys(raw).some((k) => !["$ref", "summary", "description"].includes(k))) throw new Error("unresolved reference");
      seen.add(ref); onReference?.(ref); raw = document;
      for (const part of ref.slice(2).split("/")) {
        if (/~(?:[^01]|$)/u.test(part)) throw new Error("invalid pointer");
        const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!object(raw) || !Object.hasOwn(raw, key)) throw new Error("missing reference");
        raw = raw[key];
      }
    }
    if (!object(raw)) throw new Error("source object required");
    return raw;
  }
  for (const operation of parsed.enumeration.operations) {
    const row = { key: operation.key, issues: [] as string[], responses: [] as ResponseRow[] };
    report.operations.push(row); report.totals.operations++;
    const responses = (document.paths as Raw)[operation.path][operation.method.toLowerCase()].responses;
    if (!object(responses)) { row.issues.push("response map unavailable"); continue; }
    for (const [statusKey, raw] of Object.entries(responses)) {
      if (statusKey.startsWith("x-")) { row.issues.push(`unvalidated response extension: ${statusKey}`); continue; }
      const locator = `#/paths/${pointer(operation.path)}/${operation.method.toLowerCase()}/responses/${pointer(statusKey)}`;
      const responseRow: ResponseRow = { statusKey, locator, resolvedLocator: null, issues: [], headers: null, links: null, media: [] };
      row.responses.push(responseRow); report.totals.responses++;
      try {
        if (!/^(?:[1-5][0-9]{2}|[1-5]XX|default)$/u.test(statusKey)) throw new Error("unsupported response status key");
        let resolvedLocator = locator;
        const response = resolveRef(raw, (ref) => { resolvedLocator = ref; });
        responseRow.resolvedLocator = resolvedLocator;
        responseRow.headers = response.headers ?? null; responseRow.links = response.links ?? null;
        if (typeof response.description !== "string") responseRow.issues.push("response description missing");
        if (response.content === undefined) continue;
        if (!object(response.content)) throw new Error("response content unavailable");
        for (const [mediaType, rawMedia] of Object.entries(response.content)) {
          const mediaRow: MediaRow = { mediaType, schemaStatus: "unresolved", schemaDiagnostics: null, issues: [], examples: [] };
          responseRow.media.push(mediaRow); report.totals.media++;
          if (!object(rawMedia)) { mediaRow.issues.push("media object unavailable"); continue; }
          const media = rawMedia;
          const json = /^application\/(?:json|[a-z0-9._-]+\+json)$/iu.test(mediaType);
          const checker = json ? createResponseSchemaChecker(document, media.schema) : null, probe = checker?.(null);
          mediaRow.schemaStatus = probe?.status ?? "unsupported-media";
          mediaRow.schemaDiagnostics = probe?.status === "checked" ? [] : probe?.errors ?? [];
          if (probe?.status === "checked") report.totals.compiledSchemas++;
          const add = (value: unknown, at: string) => {
            const scope = /^[1-5][0-9]{2}$/u.test(statusKey) ? "operation-body-contract" : "body-schema-only";
            const example: ExampleRow = { locator: at, origin: "source-declared-example", scope, status: "unresolved", detail: null };
            mediaRow.examples.push(example);
            try {
              if (!checker) throw new Error("non-JSON source example not executed");
              const stack: Array<[unknown, number]> = [[value, 0]]; let nodes = 0;
              while (stack.length) {
                const [part, depth] = stack.pop()!;
                if (++nodes > 10000 || depth > 64 || part === undefined || (typeof part === "number" && (!Number.isFinite(part) || (Number.isInteger(part) && !Number.isSafeInteger(part))))) throw new Error("example JSON model/budget unsupported");
                if (part && typeof part === "object") for (const child of Object.values(part)) stack.push([child, depth + 1]);
              }
              const text = JSON.stringify(value);
              if (typeof text !== "string" || Buffer.byteLength(text) > 1048576) throw new Error("example text unavailable/budget");
              const checked = scope === "operation-body-contract" ? checkApiResponseObservation(source, format, {
                operationKey: operation.key, statusCode: Number(statusKey), mediaType, bodyText: text,
              }) : checker(value);
              example.detail = checked;
              if (checked.status === "checked") example.status = checked.valid ? "valid" : "invalid";
            } catch (error) { example.detail = String(error); }
          };
          const mediaLocator = `${resolvedLocator}/content/${pointer(mediaType)}`;
          if (Object.hasOwn(media, "example")) add(media.example, `${mediaLocator}/example`);
          if (Object.hasOwn(media, "example") && Object.hasOwn(media, "examples")) mediaRow.issues.push("example/examples mutually exclusive source declarations");
          if (media.examples !== undefined) {
            if (!object(media.examples)) mediaRow.issues.push("examples map unavailable");
            else for (const [name, entry] of Object.entries(media.examples)) {
              const at = `${mediaLocator}/examples/${pointer(name)}`;
              try {
                let exampleLocator = at;
                const example = resolveRef(entry, (ref) => { exampleLocator = ref; });
                if (example.externalValue !== undefined || !Object.hasOwn(example, "value")) throw new Error("external/missing example value not executed");
                add(example.value, `${exampleLocator}/value`);
              } catch (error) { mediaRow.examples.push({ locator: at, origin: "source-declared-example", scope: "unexecuted", status: "unresolved", detail: String(error) }); }
            }
          }
          try {
            let schemaLocator = `${mediaLocator}/schema`;
            const schema = resolveRef(media.schema, (ref) => { schemaLocator = ref; });
            if (Object.hasOwn(schema, "example")) add(schema.example, `${schemaLocator}/example`);
          } catch (error) { mediaRow.issues.push(`root schema example lookup: ${String(error)}`); }
          for (const example of mediaRow.examples) report.totals[example.status === "valid" ? "validExamples" : example.status === "invalid" ? "invalidExamples" : "unresolvedExamples"]++;
        }
      } catch (error) { responseRow.issues.push(String(error)); }
    }
  }
  return report;
}

if (import.meta.main) {
  const inputs = process.argv.find((s) => s.startsWith("--inputs="))?.slice(9), outPath = process.argv.find((s) => s.startsWith("--out="))?.slice(6);
  if (!inputs || !outPath) throw new Error("--inputs=<bound-index.json> --out=<new-directory>");
  const root = process.cwd(), indexPath = await resolveContainedExistingFile(root, inputs, "response input index");
  const indexBytes = await readFile(indexPath), index = JSON.parse(indexBytes.toString());
  if (!Array.isArray(index.inputs) || index.inputs.some((i: any) => !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(i.inputId))
    || new Set(index.inputs.map((i: any) => i.inputId)).size !== index.inputs.length) throw new Error("safe unique input identities required");
  const out = await createContainedDirectory(root, outPath, "response output");
  const files = ["src/skill-ir/api-schema-checker.ts", "src/skill-ir/api-response-observation.ts", "scripts/skill-ir/api-response-schema-development.ts", "bun.lock"];
  const summary = { exposure: "development-source-examples", executionCommit: execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    inputIndexSha256: sha(indexBytes), sourceBindings: await Promise.all(files.map(async (path) => ({ path, sha256: sha(await readFile(path)) }))),
    runtime: { bun: Bun.version }, rows: [] as unknown[], projectModelCalls: 0, paidCalls: 0, liveObservations: 0, developerAgentCost: "unmeasured-separate" };
  for (const input of index.inputs) {
    try {
      const local = relative(root, resolve(dirname(indexPath), input.localPath)).replaceAll("\\", "/");
      const bytes = await readFile(await resolveContainedExistingFile(root, local, "response input"));
      if (input.status !== "acquired" || !["json", "yaml"].includes(input.format) || sha(bytes) !== input.sha256) throw new Error("input binding mismatch");
      const report = analyzeResponseSchemas(bytes.toString(), input.format), encoded = JSON.stringify(report, null, 2) + "\n";
      await writeFile(resolve(out, `${input.inputId}.json`), encoded, { flag: "wx" });
      summary.rows.push({ inputId: input.inputId, status: "analyzed", sourceSha256: sha(bytes), reportSha256: sha(encoded), totals: report.totals, enumerationComplete: report.enumerationComplete });
    } catch (error) { summary.rows.push({ inputId: input.inputId, status: "error", error: String(error) }); }
    await writeFile(resolve(out, "report.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(JSON.stringify(summary.rows.at(-1)));
  }
}
