import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import ts from "typescript";
import {
  SemanticRuntimeContractSchema,
  SemanticScanPolicySchema,
  type SemanticRuntimeContract,
  type SemanticScanPolicy,
} from "./semantic-contract";

export type SemanticPublicRules = {
  portVariableSuffixes: string[];
  portRange?: { minimum: number; maximum: number };
  sensitiveNameTokens: string[];
};

export type DeriveSemanticContractOptions = {
  workDir: string;
  publicRules: SemanticPublicRules;
  policy: SemanticScanPolicy;
};

type EvidenceKind = SemanticRuntimeContract["observedVariables"][number]["evidenceKinds"][number];
type SourceRef = SemanticRuntimeContract["observedVariables"][number]["sourceRefs"][number];

type MutableVariable = {
  name: string;
  evidenceKinds: Set<EvidenceKind>;
  sourceRefs: SourceRef[];
  inferredType?: "integer";
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
        throw new Error(`Semantic evidence rejects symlink: ${posixRelative(root, path)}`);
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
        throw new Error(`Semantic evidence file limit exceeded: ${policy.maxFiles}`);
      }
      if (totalBytes > policy.maxBytes) {
        throw new Error(`Semantic evidence byte limit exceeded: ${policy.maxBytes}`);
      }
    }
  }

  await visit(root);
  return files;
}

function ensureVariable(variables: Map<string, MutableVariable>, name: string): MutableVariable {
  let variable = variables.get(name);
  if (!variable) {
    variable = { name, evidenceKinds: new Set(), sourceRefs: [] };
    variables.set(name, variable);
  }
  return variable;
}

function addRef(variable: MutableVariable, ref: SourceRef): void {
  if (!variable.sourceRefs.some((candidate) =>
    candidate.relativePath === ref.relativePath
    && candidate.symbol === ref.symbol
    && candidate.evidenceKind === ref.evidenceKind)) {
    variable.sourceRefs.push(ref);
  }
  variable.evidenceKinds.add(ref.evidenceKind);
}

function environmentName(node: ts.Node): string | undefined {
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

function isProcessEnvExpression(node: ts.Node): boolean {
  return ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "process"
    && node.name.text === "env";
}

function sensitiveName(name: string, rules: SemanticPublicRules): boolean {
  const upper = name.toUpperCase();
  return rules.sensitiveNameTokens.some((token) => upper.includes(token.toUpperCase()));
}

function parseDotenvNames(text: string): string[] {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) names.add(match[1]);
  }
  return [...names].sort();
}

function scriptKind(path: string): ts.ScriptKind {
  const extension = extname(path).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export async function deriveSemanticContractFromWorkdir(
  options: DeriveSemanticContractOptions,
): Promise<SemanticRuntimeContract> {
  const root = resolve(options.workDir);
  const policy = SemanticScanPolicySchema.parse(options.policy);
  const variables = new Map<string, MutableVariable>();
  const findings: SemanticRuntimeContract["sourceQualifiedFindings"] = [];
  const limitations: SemanticRuntimeContract["limitations"] = [];
  const addLimitation = (code: SemanticRuntimeContract["limitations"][number]["code"], relativePath: string) => {
    if (!limitations.some((item) => item.code === code && item.relativePath === relativePath)) {
      limitations.push({ code, relativePath });
    }
  };
  const files = await collectFiles(root, policy);

  for (const file of files) {
    if (file.kind === "unsupported") {
      addLimitation("unsupported-extension", file.relativePath);
      continue;
    }
    const bytes = await readFile(file.absolutePath);
    const text = bytes.toString("utf8");
    if (text.includes("\uFFFD")) {
      addLimitation("unsupported-encoding", file.relativePath);
      continue;
    }

    if (file.kind === "dotenv") {
      for (const name of parseDotenvNames(text)) {
        const variable = ensureVariable(variables, name);
        addRef(variable, {
          relativePath: file.relativePath,
          symbol: name,
          evidenceKind: "dotenv-definition",
        });
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
      if (
        ts.isElementAccessExpression(node)
        && isProcessEnvExpression(node.expression)
        && node.argumentExpression
        && !ts.isStringLiteral(node.argumentExpression)
        && !ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)
      ) {
        addLimitation("ambiguous-evidence", file.relativePath);
      }
      const envName = environmentName(node);
      if (envName) {
        const variable = ensureVariable(variables, envName);
        addRef(variable, {
          relativePath: file.relativePath,
          symbol: envName,
          evidenceKind: "environment-reference",
        });
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const conversion = node.expression.text;
        const argument = node.arguments[0];
        const convertedName = argument ? environmentName(argument) : undefined;
        if (convertedName && (conversion === "Number" || conversion === "parseInt")) {
          const variable = ensureVariable(variables, convertedName);
          variable.inferredType = "integer";
          addRef(variable, {
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
            evidenceKind: "literal-assignment" as const,
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

  const observedVariables = [...variables.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((variable) => {
      const constraints: SemanticRuntimeContract["observedVariables"][number]["constraints"] = [];
      if (
        variable.inferredType === "integer"
        && options.publicRules.portRange
        && options.publicRules.portVariableSuffixes.some((suffix) => variable.name.endsWith(suffix))
      ) {
        constraints.push(
          { field: "minimum", value: options.publicRules.portRange.minimum },
          { field: "maximum", value: options.publicRules.portRange.maximum },
        );
        variable.evidenceKinds.add("public-skill-rule");
      }
      const markerRequired = sensitiveName(variable.name, options.publicRules);
      if (markerRequired) variable.evidenceKinds.add("sensitive-name-pattern");
      return {
        name: variable.name,
        evidenceKinds: [...variable.evidenceKinds].sort(),
        sourceRefs: variable.sourceRefs.sort((left, right) =>
          `${left.relativePath}:${left.symbol}:${left.evidenceKind}`
            .localeCompare(`${right.relativePath}:${right.symbol}:${right.evidenceKind}`)),
        ...(variable.inferredType ? { inferredType: variable.inferredType } : {}),
        constraints,
        sensitiveMarkerRequired: markerRequired,
      };
    });

  findings.sort((left, right) =>
    `${left.relativePath}:${left.symbol}`.localeCompare(`${right.relativePath}:${right.symbol}`));
  limitations.sort((left, right) =>
    `${left.relativePath ?? ""}:${left.code}`.localeCompare(`${right.relativePath ?? ""}:${right.code}`));
  return SemanticRuntimeContractSchema.parse({
    schemaVersion: "skill-ir-semantic-runtime-contract/v1",
    codeCatalog: "semantic-error-codes/v1",
    skillId: "env-manager",
    observedVariables,
    sourceQualifiedFindings: findings,
    limitations,
  });
}
