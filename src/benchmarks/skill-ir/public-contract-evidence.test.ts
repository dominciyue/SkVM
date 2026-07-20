import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  derivePublicRuntimeContractFromWorkdir,
  type PublicContractDerivationOptions,
} from "./public-contract-evidence";
import { derivePublicContractClassification } from "./classification-evidence";

const tempDirs: string[] = [];
const digest = "a".repeat(64);

const baseOptions: Omit<PublicContractDerivationOptions, "workDir"> = {
  taskContractDigest: digest,
  generatedOutputs: [".env.example", ".env.schema.json", "env-report.json"],
  publicPrefixes: ["VITE_", "NEXT_PUBLIC_"],
  publicRules: {
    portVariableSuffixes: ["_PORT"],
    portRange: { minimum: 1, maximum: 65535 },
    sensitiveNameTokens: ["KEY", "TOKEN", "PASSWORD", "SECRET"],
  },
  policy: {
    allowedExtensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
    excludedDirectories: ["node_modules", ".git", ".skvm-artifact"],
    maxFiles: 100,
    maxBytes: 1024 * 1024,
  },
};

async function workdir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "skill-ir-public-contract-evidence-"));
  tempDirs.push(path);
  return path;
}

async function derive(
  root: string,
  overrides: Partial<Omit<PublicContractDerivationOptions, "workDir">> = {},
) {
  return derivePublicRuntimeContractFromWorkdir({
    ...baseOptions,
    ...overrides,
    workDir: root,
  });
}

afterEach(async () => {
  for (const path of tempDirs.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

describe("V3 public contract evidence graph", () => {
  test("derives Node definitions, references, rules, and source-qualified findings", async () => {
    const root = await workdir();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, ".env"),
      [
        "APP_PORT=3000",
        "DB_PASSWORD=TEST_ONLY_DB_PASSWORD_CANARY",
        "OLD_API_KEY=TEST_ONLY_OLD_KEY_CANARY",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "src/config.ts"),
      [
        "export const port = Number(process.env.APP_PORT);",
        "export const redis = process.env.REDIS_URL;",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "src/auth.ts"),
      'export const INTERNAL_TOKEN = "TEST_ONLY_INTERNAL_TOKEN_CANARY";\n',
      "utf8",
    );

    const contract = await derive(root);
    expect(contract.variables.map((variable) => variable.name)).toEqual([
      "APP_PORT",
      "DB_PASSWORD",
      "OLD_API_KEY",
      "REDIS_URL",
    ]);
    const port = contract.variables.find((variable) => variable.name === "APP_PORT")!;
    expect(port.definitions).toHaveLength(1);
    expect(port.references).toHaveLength(1);
    expect(port.rules).toEqual([
      expect.objectContaining({ field: "maximum", value: 65535, disposition: "confirmed" }),
      expect.objectContaining({ field: "minimum", value: 1, disposition: "confirmed" }),
      expect.objectContaining({ field: "required", value: true, disposition: "confirmed" }),
      expect.objectContaining({ field: "type", value: "integer", disposition: "confirmed" }),
    ]);

    expect(derivePublicContractClassification(contract)).toEqual({
      definedAndUsed: ["APP_PORT"],
      definedUnconfirmedUnused: ["DB_PASSWORD", "OLD_API_KEY"],
      usedUndefined: ["REDIS_URL"],
      hardcodedSecrets: ["src/auth.ts:INTERNAL_TOKEN"],
      exposureRisks: [],
    });

    const serialized = JSON.stringify(contract);
    for (const forbidden of [
      "TEST_ONLY_DB_PASSWORD_CANARY",
      "TEST_ONLY_OLD_KEY_CANARY",
      "TEST_ONLY_INTERNAL_TOKEN_CANARY",
      "definedAndUsed",
      "usedUndefined",
      "expected",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("derives Vite and Next public exposure only from sensitive client references", async () => {
    const root = await workdir();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, ".env"),
      [
        "VITE_API_URL=https://api.example.test",
        "VITE_PUBLIC_TOKEN=TEST_ONLY_VITE_TOKEN_CANARY",
        "NEXT_PUBLIC_ANALYTICS_TOKEN=TEST_ONLY_NEXT_TOKEN_CANARY",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "src/client.ts"),
      [
        "export const apiUrl = import.meta.env.VITE_API_URL;",
        "export const publicToken = import.meta.env.VITE_PUBLIC_TOKEN;",
        "export const analytics = process.env.NEXT_PUBLIC_ANALYTICS_TOKEN;",
      ].join("\n"),
      "utf8",
    );

    const contract = await derive(root);
    expect(derivePublicContractClassification(contract).exposureRisks).toEqual([
      "src/client.ts:NEXT_PUBLIC_ANALYTICS_TOKEN",
      "src/client.ts:VITE_PUBLIC_TOKEN",
    ]);
    const apiUrl = contract.variables.find((variable) => variable.name === "VITE_API_URL")!;
    expect(apiUrl.references[0]?.evidenceKind).toBe("client-environment-reference");
    expect(derivePublicContractClassification(contract).exposureRisks).not.toContain(
      "src/client.ts:VITE_API_URL",
    );
  });

  test("removes or downgrades conclusions when public evidence is removed", async () => {
    const root = await workdir();
    await writeFile(join(root, ".env"), "APP_PORT=3000\n", "utf8");
    await writeFile(
      join(root, "config.ts"),
      "export const port = Number(process.env.APP_PORT);\n",
      "utf8",
    );
    const complete = await derive(root);
    expect(derivePublicContractClassification(complete).definedAndUsed).toEqual(["APP_PORT"]);
    expect(complete.variables[0]?.rules.some((rule) => rule.field === "type")).toBe(true);
    expect(
      complete.variables[0]?.rules
        .find((rule) => rule.field === "type")
        ?.evidenceRefs
        .map((ref) => ref.evidenceKind)
        .sort(),
    ).toEqual(["integer-conversion", "integer-literal-shape"]);

    await writeFile(join(root, ".env"), "APP_PORT=opaque\n", "utf8");
    await writeFile(join(root, "config.ts"), "export const port = 3000;\n", "utf8");
    const definitionOnly = await derive(root);
    expect(derivePublicContractClassification(definitionOnly).definedUnconfirmedUnused).toEqual([
      "APP_PORT",
    ]);
    expect(definitionOnly.variables[0]?.rules.some((rule) => rule.field === "type")).toBe(false);

    await writeFile(join(root, ".env"), "", "utf8");
    await writeFile(
      join(root, "config.ts"),
      "export const port = process.env.APP_PORT;\n",
      "utf8",
    );
    const referenceOnly = await derive(root);
    expect(derivePublicContractClassification(referenceOnly).usedUndefined).toEqual(["APP_PORT"]);

    const noPrefix = await derive(root, { publicPrefixes: [] });
    expect(derivePublicContractClassification(noPrefix).exposureRisks).toEqual([]);
  });

  test("downgrades conflicting type evidence and never serializes literal values", async () => {
    const root = await workdir();
    await writeFile(join(root, ".env"), "APP_PORT=https://example.test/private\n", "utf8");
    await writeFile(
      join(root, "config.ts"),
      "export const port = Number(process.env.APP_PORT);\n",
      "utf8",
    );

    const contract = await derive(root);
    const port = contract.variables.find((variable) => variable.name === "APP_PORT")!;
    expect(port.rules.some((rule) => rule.field === "type" && rule.disposition === "confirmed")).toBe(
      false,
    );
    expect(contract.limitations).toContainEqual(expect.objectContaining({
      code: "conflicting-evidence",
      relativePath: "config.ts",
    }));
    expect(JSON.stringify(contract)).not.toContain("https://example.test/private");
  });

  test("records dynamic access as a limitation without inventing a classification entry", async () => {
    const root = await workdir();
    await writeFile(
      join(root, "dynamic.ts"),
      "const name = getName(); export const value = process.env[name];\n",
      "utf8",
    );
    const contract = await derive(root);
    expect(contract.variables).toEqual([]);
    expect(contract.limitations).toEqual([
      expect.objectContaining({
        code: "ambiguous-evidence",
        relativePath: "dynamic.ts",
      }),
    ]);
    expect(derivePublicContractClassification(contract)).toEqual({
      definedAndUsed: [],
      definedUnconfirmedUnused: [],
      usedUndefined: [],
      hardcodedSecrets: [],
      exposureRisks: [],
    });
  });
});
