import type { MarkdownStudyInput } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
export { isDeepStrictEqual as sameValue } from "node:util"
export const markdownInput = (instructions: string, instructionPath: string): MarkdownStudyInput => ({ instructions, instructionPath, instructionOrigin: "independent-author" })
export const compareArgs = (previous: string, input: string) => ["compare", "--previous=" + previous, "--input=" + input]

export function assertVerificationIdentity(frozen: Record<string, unknown>, expected: { generationFreezeSha256: string; generationClosedSha256: string; providerCalls: number }) {
  if (frozen.purpose !== "post-generation-verification" || frozen.noAdditionalGeneration !== true ||
      Object.entries(expected).some(([key, value]) => frozen[key] !== value)) throw new Error("Verification identity changed")
}
