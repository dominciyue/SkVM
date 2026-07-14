import { buildCorpusMatrixInput, buildExperimentMatrix } from "./matrix";
import type { CorpusId } from "./corpus-registry";

export function parseMatrixRunArgs(argv: string[]): { corpus: CorpusId } {
  const corpusArg = argv.find((arg) => arg.startsWith("--corpus="));
  if (!corpusArg) {
    throw new Error("--corpus is required; choose calibration or pilot");
  }
  const corpus = corpusArg.slice("--corpus=".length);
  if (corpus !== "calibration" && corpus !== "pilot") {
    throw new Error(`Unknown Skill IR corpus: ${corpus}`);
  }
  if (argv.length !== 1) {
    throw new Error(`Unknown argument: ${argv.find((arg) => arg !== corpusArg)}`);
  }
  return { corpus };
}

if (import.meta.main) {
  try {
    const args = parseMatrixRunArgs(process.argv.slice(2));
    const input = buildCorpusMatrixInput(args.corpus);
    const matrix = buildExperimentMatrix(input);
    console.log(JSON.stringify({ corpus: args.corpus, count: matrix.length, input, matrix }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
