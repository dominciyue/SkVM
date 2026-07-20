import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import ts from "typescript";
import {
  PublicRuntimeContractSchema,
  type PublicEvidenceRef,
  type PublicRule,
  type PublicRuntimeContract,
} from "./public-contract";
import {
  SemanticScanPolicySchema,
  type SemanticScanPolicy,
} from "./semantic-contract";

export type PublicContractRules = {
  portVariableSuffixes: string[];
  portRange?: { minimum: number; maximum: number };
  sensitiveNameTokens: string[];
};

export type PublicContractDerivationOptions = {
  workDir: string;
  taskContractDigest: string;
  generatedOutputs: string[];
  publicPrefixes: string[];
  publicRules: PublicContractRules;
  policy: SemanticScanPolicy;
};

type LiteralShape = "integer" | "boolean" | "uri";

type MutableVariable = {
  name: string;
  definitions: PublicEvidenceRef[];
  references: PublicEvidenceRef[];
  integerConversions: PublicEvidenceRef[];
  literalShapes: Map<LiteralShape, PublicEvidenceRef[]>;
};

type ScanFile = {
  absolutePath: string;
  relativePath: string;
  kind: "dotenv" | "source" | "unsupported";
};

const UNSUPPORTED_SOURCE_EXTENSIONS = new Set([".py", ".go", ".java", ".rb", ".php"]);

function posixRelative(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

function scriptKind(path: string): ts.ScriptKind {
  const extension = extname(path).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

async function collectFiles(root: string, policy: SemanticScanPolicy): Promise<ScanFile[]> {
  const files: ScanFile[] = [];
  let totalBytes = 0;

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (policy.excludedDirectories.includes(entry.name)) continue;
      const path = resolve(directory, entry.name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) {
        throw new Error(`Public contract evidence rejects symlink: ${posixRelative(root, path)}`);
      }
      if (stat.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!stat.isFile()) continue;

      const name = basename(path);
      const extension = extname(name).toLowerCase();
      const kind = (name === ".env" || (name.startsWith(".env.") && name !== ".env.example"))
        ? "dotenv"
        : policy.allowedExtensions.includes(extension as SemanticScanPolicy["allowedExtensions"][number])
          ? "source"
          : UNSUPPORTED_SOURCE_EXTENSIONS.has(extension)
            ? "unsupported"
            : undefined;
      if (!kind) continue;
      files.push({ absolutePath: path, relativePath: posixRelative(root, path), kind });
      totalBytes += stat.size;
      if (files.length > policy.maxFiles) {
        throw new Error(`Public contract evidence file limit exceeded: ${policy.maxFiles}`);
      }
      if (totalBytes > policy.maxBytes) {
        throw new Error(`Public contract evidence byte limit exceeded: ${policy.maxBytes}`);
      }
    }
  }

  await visit(root);
  return files;
}

function ensureVariable(variables: Map<string, MutableVariable>, name: string): MutableVariable {
  let variable = variables.get(name);
  if (!variable) {
    variable = {
      name,
      definitions: [],
      references: [],
      integerConversions: [],
      literalShapes: new Map(),
    };
    variables.set(name, variable);
  }
  return variable;
}

function refKey(ref: PublicEvidenceRef): string {
  return `${ref.relativePath}:${ref.symbol}:${ref.evidenceKind}`;
}

function addRef(refs: PublicEvidenceRef[], ref: PublicEvidenceRef): void {
  if (!refs.some((candidate) => refKey(candidate) === refKey(ref))) refs.push(ref);
}

function parseDotenvEntries(text: string): Array<{ name: string; shape?: LiteralShape }> {
  const entries = new Map<string, { name: string; shape?: LiteralShape }>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match?.[1]) continue;
    const raw = (match[2] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
    let shape: LiteralShape | undefined;
    if (/^[+-]?\d+$/.test(raw)) shape = "integer";
    else if (/^(?:true|false)$/i.test(raw)) shape = "boolean";
    else if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) shape = "uri";
    entries.set(match[1], { name: match[1], ...(shape ? { shape } : {}) });
  }
  return [...entries.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function processEnvironmentName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    const env = node.expression;
    if (
      ts.isPropertyAccessExpression(env)
      && ts.isIdentifier(env.expression)
      && env.expression.text === "process"
      && env.name.text === "env"
    ) {
      return node.name.text;
    }
  }
  if (ts.isElementAccessExpression(node)) {
    const env = node.expression;
    const argument = node.argumentExpression;
    if (
      ts.isPropertyAccessExpression(env)
      && ts.isIdentifier(env.expression)
      && env.expression.text === "process"
      && env.name.text === "env"
      && argument
      && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
    ) {
      return argument.text;
    }
  }
  return undefined;
}

function importMetaEnvironmentName(node: ts.Node): string | undefined {
  if (!ts.isPropertyAccessExpression(node)) return undefined;
  const env = node.expression;
  if (
    !ts.isPropertyAccessExpression(env)
    || env.name.text !== "env"
    || !ts.isMetaProperty(env.expression)
    || env.expression.keywordToken !== ts.SyntaxKind.ImportKeyword
  ) {
    return undefined;
  }
  return node.name.text;
}

function isDynamicProcessEnvironmentAccess(node: ts.Node): boolean {
  if (!ts.isElementAccessExpression(node) || !node.argumentExpression) return false;
  const env = node.expression;
  return ts.isPropertyAccessExpression(env)
    && ts.isIdentifier(env.expression)
    && env.expression.text === "process"
    && env.name.text === "env"
    && !ts.isStringLiteral(node.argumentExpression)
    && !ts.isNoSubstitutionTemplateLiteral(node.argumentExpression);
}

function sensitiveName(name: string, rules: PublicContractRules): boolean {
  const upper = name.toUpperCase();
  return rules.sensitiveNameTokens.some((token) => upper.includes(token.toUpperCase()));
}

function publicSkillRef(symbol: string): PublicEvidenceRef {
  return {
    relativePath: "SKILL.md",
    symbol,
    evidenceKind: "public-skill-rule",
  };
}

function sortRefs(refs: PublicEvidenceRef[]): PublicEvidenceRef[] {
  return refs.sort((left, right) => refKey(left).localeCompare(refKey(right)));
}

export async function derivePublicRuntimeContractFromWorkdir(
  options: PublicContractDerivationOptions,
): Promise<PublicRuntimeContract> {
  const root = resolve(options.workDir);
  const policy = SemanticScanPolicySchema.parse(options.policy);
  const variables = new Map<string, MutableVariable>();
  const findings: PublicRuntimeContract["sourceQualifiedFindings"] = [];
  const limitations: PublicRuntimeContract["limitations"] = [];

  const addLimitation = (
    code: PublicRuntimeContract["limitations"][number]["code"],
    relativePath: string,
    evidenceRefs: PublicEvidenceRef[],
  ) => {
    if (!limitations.some((item) => item.code === code && item.relativePath === relativePath)) {
      limitations.push({ code, relativePath, evidenceRefs: sortRefs(evidenceRefs) });
    }
  };

  for (const file of await collectFiles(root, policy)) {
    if (file.kind === "unsupported") {
      addLimitation("unsupported-extension", file.relativePath, [{
        relativePath: file.relativePath,
        symbol: "unsupported-source",
        evidenceKind: "unsupported-source",
      }]);
      continue;
    }
    const bytes = await readFile(file.absolutePath);
    const text = bytes.toString("utf8");
    if (text.includes("\uFFFD")) {
      addLimitation("unsupported-encoding", file.relativePath, [{
        relativePath: file.relativePath,
        symbol: "unsupported-encoding",
        evidenceKind: "unsupported-source",
      }]);
      continue;
    }

    if (file.kind === "dotenv") {
      for (const entry of parseDotenvEntries(text)) {
        const variable = ensureVariable(variables, entry.name);
        addRef(variable.definitions, {
          relativePath: file.relativePath,
          symbol: entry.name,
          evidenceKind: "dotenv-definition",
        });
        if (entry.shape) {
          const refs = variable.literalShapes.get(entry.shape) ?? [];
          addRef(refs, {
            relativePath: file.relativePath,
            symbol: entry.name,
            evidenceKind: entry.shape === "uri"
              ? "uri-literal-shape"
              : entry.shape === "boolean"
                ? "boolean-literal-shape"
                : "integer-literal-shape",
          });
          variable.literalShapes.set(entry.shape, refs);
        }
      }
      continue;
    }

    const source = ts.createSourceFile(
      file.relativePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(file.relativePath),
    );
    const visit = (node: ts.Node): void => {
      if (isDynamicProcessEnvironmentAccess(node)) {
        addLimitation("ambiguous-evidence", file.relativePath, [{
          relativePath: file.relativePath,
          symbol: "dynamic-env-access",
          evidenceKind: "ambiguous-access",
        }]);
      }

      const processName = processEnvironmentName(node);
      const importMetaName = importMetaEnvironmentName(node);
      const envName = processName ?? importMetaName;
      if (envName) {
        const variable = ensureVariable(variables, envName);
        const clientVisible = Boolean(importMetaName)
          || options.publicPrefixes.some((prefix) => envName.startsWith(prefix));
        addRef(variable.references, {
          relativePath: file.relativePath,
          symbol: envName,
          evidenceKind: clientVisible
            ? "client-environment-reference"
            : "environment-reference",
        });
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const argument = node.arguments[0];
        const convertedName = argument
          ? processEnvironmentName(argument) ?? importMetaEnvironmentName(argument)
          : undefined;
        if (convertedName && (node.expression.text === "Number" || node.expression.text === "parseInt")) {
          const variable = ensureVariable(variables, convertedName);
          addRef(variable.integerConversions, {
            relativePath: file.relativePath,
            symbol: convertedName,
            evidenceKind: "integer-conversion",
          });
        }
      }

      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && sensitiveName(node.name.text, options.publicRules)
        && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
      ) {
        const finding = {
          relativePath: file.relativePath,
          symbol: node.name.text,
          findingKind: "hardcoded-sensitive-literal" as const,
          evidenceRefs: [{
            relativePath: file.relativePath,
            symbol: node.name.text,
            evidenceKind: "sensitive-literal-shape" as const,
          }],
        };
        if (!findings.some((candidate) =>
          candidate.relativePath === finding.relativePath && candidate.symbol === finding.symbol)) {
          findings.push(finding);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  const publicVariables = [...variables.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((variable) => {
      const rules: PublicRule[] = [];
      const definitionRefs = sortRefs(variable.definitions);
      const referenceRefs = sortRefs(variable.references);
      const presenceRefs = [...definitionRefs, ...referenceRefs];
      rules.push({
        field: "required",
        value: referenceRefs.length > 0,
        disposition: "confirmed",
        evidenceRefs: presenceRefs,
      });

      const integerRefs = sortRefs([
        ...variable.integerConversions,
        ...(variable.literalShapes.get("integer") ?? []),
      ]);
      const uriRefs = sortRefs(variable.literalShapes.get("uri") ?? []);
      const booleanRefs = sortRefs(variable.literalShapes.get("boolean") ?? []);
      const typeKinds = [
        ...(integerRefs.length > 0 ? ["integer" as const] : []),
        ...(uriRefs.length > 0 ? ["uri" as const] : []),
        ...(booleanRefs.length > 0 ? ["boolean" as const] : []),
      ];
      if (typeKinds.length > 1) {
        addLimitation(
          "conflicting-evidence",
          variable.integerConversions[0]?.relativePath
            ?? uriRefs[0]?.relativePath
            ?? booleanRefs[0]?.relativePath
            ?? definitionRefs[0]!.relativePath,
          [...integerRefs, ...uriRefs, ...booleanRefs],
        );
      } else if (typeKinds[0] === "integer") {
        rules.push({
          field: "type",
          value: "integer",
          disposition: "confirmed",
          evidenceRefs: integerRefs,
        });
        if (
          options.publicRules.portRange
          && options.publicRules.portVariableSuffixes.some((suffix) => variable.name.endsWith(suffix))
        ) {
          const evidenceRefs = [...integerRefs, publicSkillRef(variable.name)];
          rules.push(
            {
              field: "minimum",
              value: options.publicRules.portRange.minimum,
              disposition: "confirmed",
              evidenceRefs,
            },
            {
              field: "maximum",
              value: options.publicRules.portRange.maximum,
              disposition: "confirmed",
              evidenceRefs,
            },
          );
        }
      } else if (typeKinds[0] === "uri") {
        rules.push(
          {
            field: "type",
            value: "string",
            disposition: "confirmed",
            evidenceRefs: uriRefs,
          },
          {
            field: "format",
            value: "uri",
            disposition: "confirmed",
            evidenceRefs: uriRefs,
          },
        );
      } else if (typeKinds[0] === "boolean") {
        rules.push({
          field: "type",
          value: "boolean",
          disposition: "confirmed",
          evidenceRefs: booleanRefs,
        });
      }

      if (sensitiveName(variable.name, options.publicRules)) {
        rules.push({
          field: "sensitive",
          value: true,
          disposition: "confirmed",
          evidenceRefs: [publicSkillRef(variable.name)],
        });
      }
      rules.sort((left, right) => left.field.localeCompare(right.field));
      return {
        name: variable.name,
        definitions: definitionRefs,
        references: referenceRefs,
        rules,
      };
    });

  findings.sort((left, right) =>
    `${left.relativePath}:${left.symbol}`.localeCompare(`${right.relativePath}:${right.symbol}`));
  limitations.sort((left, right) =>
    `${left.relativePath ?? ""}:${left.code}`.localeCompare(`${right.relativePath ?? ""}:${right.code}`));

  return PublicRuntimeContractSchema.parse({
    schemaVersion: "skill-ir-public-runtime-contract/v3",
    codeCatalog: "public-contract-error-codes/v2",
    skillId: "env-manager",
    taskContractDigest: options.taskContractDigest,
    generatedOutputs: options.generatedOutputs,
    publicPrefixes: options.publicPrefixes,
    variables: publicVariables,
    sourceQualifiedFindings: findings,
    limitations,
  });
}
