import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deriveSemanticContractFromWorkdir,
  type SemanticPublicRules,
} from "./semantic-evidence";
import type { SemanticScanPolicy } from "./semantic-contract";

const tempDirs: string[] = [];

const policy: SemanticScanPolicy = {
  allowedExtensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
  excludedDirectories: ["node_modules", ".git", ".skvm-artifact"],
  maxFiles: 100,
  maxBytes: 1024 * 1024,
};

const publicRules: SemanticPublicRules = {
  portVariableSuffixes: ["_PORT"],
  portRange: { minimum: 1, maximum: 65535 },
  sensitiveNameTokens: ["KEY", "TOKEN", "PASSWORD", "SECRET"],
};

async function workdir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "skill-ir-semantic-evidence-"));
  tempDirs.push(path);
  return path;
}

async function derive(
  root: string,
  rules: SemanticPublicRules = publicRules,
  scanPolicy: SemanticScanPolicy = policy,
) {
  return deriveSemanticContractFromWorkdir({
    workDir: root,
    publicRules: rules,
    policy: scanPolicy,
  });
}

afterEach(async () => {
  for (const path of tempDirs.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

describe("semantic evidence derivation", () => {
  test("derives inventory, explicit types, public constraints, sensitive markers, and findings", async () => {
    const root = await workdir();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, ".env"),
      "APP_PORT=3000\nDB_PASSWORD=TEST_ONLY_DB_VALUE_CANARY\nOLD_API_KEY=TEST_ONLY_KEY_VALUE_CANARY\n",
      "utf8",
    );
    await writeFile(
      join(root, "src/config.ts"),
      [
        "export const port = Number(process.env.APP_PORT);",
        "export const redis = process.env.REDIS_URL;",
        'export const INTERNAL_TOKEN = "TEST_ONLY_SOURCE_VALUE_CANARY";',
      ].join("\n"),
      "utf8",
    );

    const contract = await derive(root);
    expect(contract.observedVariables.map((item) => item.name)).toEqual([
      "APP_PORT",
      "DB_PASSWORD",
      "OLD_API_KEY",
      "REDIS_URL",
    ]);
    const port = contract.observedVariables.find((item) => item.name === "APP_PORT")!;
    expect(port.inferredType).toBe("integer");
    expect(port.constraints).toEqual([
      { field: "minimum", value: 1 },
      { field: "maximum", value: 65535 },
    ]);
    expect(contract.observedVariables.find((item) => item.name === "DB_PASSWORD")?.sensitiveMarkerRequired).toBe(true);
    expect(contract.sourceQualifiedFindings).toEqual([
      {
        relativePath: "src/config.ts",
        symbol: "INTERNAL_TOKEN",
        findingKind: "hardcoded-sensitive-literal",
        evidenceRefs: [{
          relativePath: "src/config.ts",
          symbol: "INTERNAL_TOKEN",
          evidenceKind: "literal-assignment",
        }],
      },
    ]);
    const serialized = JSON.stringify(contract);
    for (const forbidden of [
      "TEST_ONLY_DB_VALUE_CANARY",
      "TEST_ONLY_KEY_VALUE_CANARY",
      "TEST_ONLY_SOURCE_VALUE_CANARY",
      "Number(process.env.APP_PORT)",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("removes every strong assertion when its legal evidence is removed", async () => {
    const numericRoot = await workdir();
    await writeFile(join(numericRoot, ".env"), "APP_PORT=3000\n", "utf8");
    await writeFile(join(numericRoot, "config.ts"), "export const port = process.env.APP_PORT;\n", "utf8");
    const withoutConversion = await derive(numericRoot);
    expect(withoutConversion.observedVariables[0]?.inferredType).toBeUndefined();
    expect(withoutConversion.observedVariables[0]?.constraints).toEqual([]);

    await writeFile(join(numericRoot, "config.ts"), "export const port = Number(process.env.APP_PORT);\n", "utf8");
    const withoutPortRule = await derive(numericRoot, { ...publicRules, portRange: undefined });
    expect(withoutPortRule.observedVariables[0]?.inferredType).toBe("integer");
    expect(withoutPortRule.observedVariables[0]?.constraints).toEqual([]);

    const neutralRoot = await workdir();
    await writeFile(join(neutralRoot, ".env"), "APP_CREDENTIAL=opaque\n", "utf8");
    const neutral = await derive(neutralRoot);
    expect(neutral.observedVariables[0]?.sensitiveMarkerRequired).toBe(false);

    const absentRoot = await workdir();
    await writeFile(join(absentRoot, "config.ts"), "export const value = 1;\n", "utf8");
    expect((await derive(absentRoot)).observedVariables).toEqual([]);

    const renamedRoot = await workdir();
    await writeFile(join(renamedRoot, "auth.ts"), 'export const INTERNAL_VALUE = "opaque";\n', "utf8");
    expect((await derive(renamedRoot)).sourceQualifiedFindings).toEqual([]);

    const dynamicRoot = await workdir();
    await writeFile(
      join(dynamicRoot, "auth.ts"),
      "export const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;\n",
      "utf8",
    );
    expect((await derive(dynamicRoot)).sourceQualifiedFindings).toEqual([]);
  });

  test("fails closed on symlinks and scan limits without returning file contents", async () => {
    const root = await workdir();
    const outside = await workdir();
    await writeFile(join(outside, "secret.ts"), 'export const TOKEN = "TEST_ONLY_OUTSIDE_CANARY";\n', "utf8");
    await symlink(join(outside, "secret.ts"), join(root, "linked.ts"));
    await expect(derive(root)).rejects.toThrow("symlink");

    const limited = await workdir();
    await writeFile(join(limited, "a.ts"), "export const a = 1;\n", "utf8");
    await writeFile(join(limited, "b.ts"), "export const b = 2;\n", "utf8");
    await expect(derive(limited, publicRules, { ...policy, maxFiles: 1 })).rejects.toThrow("file limit");
  });

  test("records closed limitations for unsupported encoding, syntax, and source extensions", async () => {
    const root = await workdir();
    await writeFile(join(root, "bad.ts"), Buffer.from([0xff, 0xfe, 0xfd]));
    await writeFile(
      join(root, "dynamic.ts"),
      "const name = getName(); export const value = process.env[name];\n",
      "utf8",
    );
    await writeFile(join(root, "config.py"), "value = os.getenv('APP_PORT')\n", "utf8");

    expect((await derive(root)).limitations).toEqual([
      { code: "unsupported-encoding", relativePath: "bad.ts" },
      { code: "unsupported-extension", relativePath: "config.py" },
      { code: "ambiguous-evidence", relativePath: "dynamic.ts" },
    ]);
  });
});
