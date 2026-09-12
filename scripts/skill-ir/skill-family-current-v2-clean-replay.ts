import { runCurrentV2N14Inside } from "../../src/skill-ir/skill-family-current-v2-n14";

function argument(name: string) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (import.meta.main) {
  const mode = argument("mode");
  if (mode !== "inside") {
    throw new Error("usage: bun ./scripts/skill-ir/skill-family-current-v2-clean-replay.ts --mode=inside --output=<absolute-path> --code-commit=<sha> --python=<absolute-path>");
  }
  const outputRoot = argument("output");
  const codeCommit = argument("code-commit");
  const pythonExecutable = argument("python");
  if (!outputRoot || !codeCommit || !pythonExecutable) throw new Error("clean replay inside mode requires output, code-commit, and python");
  const report = await runCurrentV2N14Inside({
    checkoutRoot: process.cwd(),
    outputRoot,
    codeCommit,
    pythonExecutable,
  });
  console.log(JSON.stringify({
    status: report.decision,
    codeCommit: report.codeCommit,
    replay: report.replay,
    verification: {
      focusedTests: report.verification.focusedTests.summary,
      typecheckExitCode: report.verification.typecheck.exitCode,
    },
    accounting: report.accounting,
  }, null, 2));
  if (report.decision !== "passed") process.exitCode = 1;
}
