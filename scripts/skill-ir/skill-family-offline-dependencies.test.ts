import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventoryOfflineDependencies, verifyOfflineDependencies } from "./skill-family-offline-dependencies";

test("offline dependency verification binds exact file bytes and detects extra or changed files", async () => {
  const root = await mkdtemp(join(tmpdir(), "skvm-offline-deps-"));
  await mkdir(join(root, "package")); await writeFile(join(root, "package/index.js"), "export const n = 1;\n");
  const manifest = await inventoryOfflineDependencies(root);
  expect(manifest.files).toHaveLength(1);
  expect(await verifyOfflineDependencies(root, manifest)).toBe(true);
  await writeFile(join(root, "package/index.js"), "export const n = 2;\n");
  await expect(verifyOfflineDependencies(root, manifest)).rejects.toThrow("dependency bytes");
  const revised = await inventoryOfflineDependencies(root);
  await writeFile(join(root, "extra.js"), "extra");
  await expect(verifyOfflineDependencies(root, revised)).rejects.toThrow("dependency bytes");
});
