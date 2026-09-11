// Read-only scope discovery over the already exposed, bound panel.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseApiTesterOperationSource } from "../../../src/skill-ir/api-tester-operation-source";
const indexPath = "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json";
const index = JSON.parse(await readFile(indexPath, "utf8")), documents = [];
for (const input of index.inputs) {
  const b = await readFile(resolve(dirname(indexPath), input.localPath));
  if (createHash("sha256").update(b).digest("hex") !== input.sha256) throw new Error("input digest mismatch");
  const parsed = parseApiTesterOperationSource(b.toString("utf8"), input.format), doc = parsed.document as any;
  const rows = [], unresolved = [];
  function dereference(raw: any) {
    let value = raw; const seen = new Set<string>();
    while (value && typeof value === "object" && "$ref" in value) {
      const ref = value.$ref;
      if (typeof ref !== "string" || !ref.startsWith("#/") || seen.has(ref) || seen.size >= 32) throw new Error("external/cyclic/invalid response/header reference");
      seen.add(ref); value = doc;
      for (const token of ref.slice(2).split("/")) {
        const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!value || !Object.hasOwn(value, key)) throw new Error("missing response/header reference");
        value = value[key];
      }
    }
    return value;
  }
  for (const op of parsed.enumeration.operations) {
    const responses = doc.paths[op.path][op.method.toLowerCase()].responses;
    for (const [responseKey, raw] of Object.entries(responses ?? {})) {
      if (responseKey.startsWith("x-")) continue;
      try {
        const response = dereference(raw);
        for (const [name, header] of Object.entries(response?.headers ?? {})) {
          try { rows.push({ operationKey: op.key, responseKey, name, declaration: header, resolved: dereference(header) }); }
          catch (e) { unresolved.push({ operationKey: op.key, responseKey, name, error: String(e) }); }
        }
      } catch (e) { unresolved.push({ operationKey: op.key, responseKey, error: String(e) }); }
    }
  }
  documents.push({ inputId: input.inputId, sha256: input.sha256, sourceEnumerationComplete: parsed.enumeration.complete, operations: parsed.enumeration.operations.length, rows, unresolved });
}
const output = process.argv.find(v => v.startsWith("--out="))?.slice(6);
if (!output) throw new Error("--out=<new-file> required");
await writeFile(output, JSON.stringify({ exposure: "development-scope-discovery", documents, interpretation: "Header occurrences, not validated source declarations or live observations", modelCalls: 0, remoteCalls: 0 }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(documents.map(d => ({ inputId: d.inputId, headers: d.rows.length, unresolved: d.unresolved.length, names: [...new Set(d.rows.map(r => r.name))] }))));
