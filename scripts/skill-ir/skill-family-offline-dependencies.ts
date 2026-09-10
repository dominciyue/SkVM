import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

type DependencyManifest = { schemaVersion: "offline-dependency-files/v1"; files: Array<{ path: string; bytes: number; sha256: string }> };
export async function inventoryOfflineDependencies(root: string): Promise<DependencyManifest> {
  const files: DependencyManifest["files"] = [];
  async function visit(path: string) {
    const target = resolve(root, path), info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error("offline dependency symbolic link/junction not allowed");
    if (info.isDirectory()) {
      for (const child of (await readdir(target)).sort()) await visit(path ? `${path}/${child}` : child);
    } else if (info.isFile()) {
      const bytes = await readFile(target);
      files.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    } else throw new Error("offline dependency nonregular entry");
  }
  await visit("");
  return { schemaVersion: "offline-dependency-files/v1", files };
}

export async function verifyOfflineDependencies(root: string, manifest: DependencyManifest): Promise<true> {
  if (JSON.stringify(await inventoryOfflineDependencies(root)) !== JSON.stringify(manifest)) throw new Error("offline dependency bytes or file inventory differ");
  return true;
}

if (import.meta.main) {
  const arg = (name: string) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
  const root = arg("root"), out = arg("out"), verify = arg("verify");
  if (!root || (!out && !verify) || (out && verify)) throw new Error("--root=<dependency-directory> and either --out=<new-manifest.json> or --verify=<manifest.json>");
  if (verify) console.log(JSON.stringify({ verified: await verifyOfflineDependencies(root, JSON.parse(await readFile(verify, "utf8"))) }));
  else {
    const manifest = await inventoryOfflineDependencies(root);
    await writeFile(out!, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ files: manifest.files.length, bytes: manifest.files.reduce((sum, f) => sum + f.bytes, 0) }));
  }
}
