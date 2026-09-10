import { createSchemaChecker, checkSchemaWitnessShape } from "./api-schema-checker";
type Raw = Record<string, any>;
export function selectRequestSchemaTask(document: Raw) {
  const candidates: Array<{ operationKey: string; schema: unknown; document: Raw }> = [];
  const dereference = (raw: Raw): Raw => {
    const seen = new Set<string>();
    while (raw?.$ref !== undefined) {
      if (typeof raw.$ref !== "string" || !raw.$ref.startsWith("#/") || seen.has(raw.$ref)) throw new Error("unresolved body reference");
      seen.add(raw.$ref);
      raw = raw.$ref.slice(2).split("/").reduce((v: any, part: string) => v?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], document);
    }
    return raw;
  };
  for (const [path, item] of Object.entries(document.paths ?? {}) as [string, Raw][]) {
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options", "trace"]) {
      const body = dereference(item[method]?.requestBody);
      if (body?.content?.["application/json"]?.schema) candidates.push({ operationKey: `${method.toUpperCase()} ${path}`,
        schema: body.content["application/json"].schema, document: { openapi: document.openapi, components: document.components ?? {} } });
    }
  }
  candidates.sort((a, b) => a.operationKey < b.operationKey ? -1 : a.operationKey > b.operationKey ? 1 : 0);
  if (!candidates.length) throw new Error("no JSON request-body task");
  return candidates[0]!;
}

export function gradeSchemaPair(document: unknown, schema: unknown, answer: unknown) {
  const check = createSchemaChecker(document, schema);
  const rows = (["minimal", "full"] as const).map((mode) => {
    const present = !!answer && typeof answer === "object" && !Array.isArray(answer) && Object.hasOwn(answer, mode);
    const value = present ? (answer as Raw)[mode] : undefined;
    const checked = check(value);
    const shape = present && checkSchemaWitnessShape(document, schema, value, mode);
    return { mode, present, checked, shape, passed: present && checked.status === "checked" && checked.valid === true && shape };
  });
  return { rows, passed: rows.filter((r) => r.passed).length, total: 2 };
}
