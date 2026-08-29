const [patchBundlePath, workDir, publicInterfacePath, outputCountText] = process.argv.slice(2);
if (!patchBundlePath || !workDir || !publicInterfacePath || !outputCountText) {
  throw new Error("usage: verified-artifact-patch-runner <patch-bundle> <workdir> <public-interface> <output-count>");
}
const outputCount = Number(outputCountText);
if (!Number.isInteger(outputCount) || outputCount < 1) throw new Error("invalid declared output count");
const child = Bun.spawn([
  process.execPath,
  patchBundlePath,
  `--workdir=${workDir}`,
  `--interface=${publicInterfacePath}`,
], { cwd: workDir, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
const [exitCode, stdout, stderr] = await Promise.all([
  child.exited,
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
]);
if (exitCode !== 0) throw new Error(`review patch failed: ${stderr.length} stderr bytes`);
const result = JSON.parse(stdout.trim()) as { status?: unknown; outputs?: unknown };
if (result.status !== "patched" || result.outputs !== outputCount) {
  throw new Error("review patch result does not match the declared output contract");
}
process.stdout.write(`${JSON.stringify(result)}\n`);
