import type { MarkdownStudyInput } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
export { isDeepStrictEqual as sameValue } from "node:util"
export const markdownInput = (instructions: string, instructionPath: string): MarkdownStudyInput => ({ instructions, instructionPath, instructionOrigin: "independent-author" })
export const compareArgs = (previous: string, input: string) => ["compare", "--previous=" + previous, "--input=" + input]
