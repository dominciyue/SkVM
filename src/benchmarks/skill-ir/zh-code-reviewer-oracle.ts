export type ZhCodeReviewCategory = "correctness" | "security" | "performance" | "maintainability"
export type ZhCodeReviewSeverity = "critical" | "major" | "minor"

export interface ZhCodeReviewOracleFinding {
  ruleId:
    | "dynamic-query"
    | "sensitive-log"
    | "dynamic-command"
    | "await-in-loop"
    | "unchecked-index-access"
    | "unchecked-find-result"
  category: ZhCodeReviewCategory
  severity: ZhCodeReviewSeverity
  path: string
  line: number
  acceptedLines: number[]
  symbol: string
}

export type ZhCodeReviewOracle =
  | { status: "confirmed"; findings: ZhCodeReviewOracleFinding[] }
  | { status: "unconfirmed"; reason: "unsupported-source-format" | "no-supported-observable-pattern" }

function enclosingSymbol(lines: string[], lineIndex: number): string {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const line = lines[index]!
    const functionMatch = line.match(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/u)
    if (functionMatch) return functionMatch[1]!
    const bindingMatch = line.match(/\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/u)
    if (bindingMatch) return bindingMatch[1]!
  }
  return "<module>"
}

function finding(
  ruleId: ZhCodeReviewOracleFinding["ruleId"],
  category: ZhCodeReviewCategory,
  severity: ZhCodeReviewSeverity,
  path: string,
  lines: string[],
  lineIndex: number,
  acceptedLineIndexes: number[] = [lineIndex],
): ZhCodeReviewOracleFinding {
  return {
    ruleId,
    category,
    severity,
    path,
    line: lineIndex + 1,
    acceptedLines: [...new Set(acceptedLineIndexes.map((entry) => entry + 1))].sort((left, right) => left - right),
    symbol: enclosingSymbol(lines, lineIndex),
  }
}

function hasOpenForLoop(lines: string[], lineIndex: number): boolean {
  let depth = 0
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    depth += (line.match(/\}/gu) ?? []).length
    depth -= (line.match(/\{/gu) ?? []).length
    if (depth < 0 && /\bfor\s*\(/u.test(line)) return true
    if (depth < 0 && !/\bfor\s*\(/u.test(line)) return false
  }
  return false
}

export function deriveZhCodeReviewOracle(sourcePath: string, sourceText: string): ZhCodeReviewOracle {
  if (!/\.(?:[cm]?[jt]sx?)$/iu.test(sourcePath)) {
    return { status: "unconfirmed", reason: "unsupported-source-format" }
  }

  const lines = sourceText.replace(/\r\n/g, "\n").split("\n")
  const findings: ZhCodeReviewOracleFinding[] = []
  const dynamicTemplates = new Map<string, number>()
  const findBindings = new Map<string, number>()

  for (const [index, line] of lines.entries()) {
    const templateBinding = line.includes("`") && line.includes("${")
      ? line.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/u)
      : null
    if (templateBinding) dynamicTemplates.set(templateBinding[1]!, index)

    const queryArgument = line.match(/\.query\s*\(\s*([A-Za-z_$][\w$]*)/u)
    const directDynamicQuery = /\.query\s*\(\s*/u.test(line) && line.includes("`") && line.includes("${")
    if (directDynamicQuery) {
      findings.push(finding("dynamic-query", "security", "critical", sourcePath, lines, index))
    } else if (queryArgument && dynamicTemplates.has(queryArgument[1]!)) {
      const evidenceLine = dynamicTemplates.get(queryArgument[1]!)!
      findings.push(finding("dynamic-query", "security", "critical", sourcePath, lines, evidenceLine, [evidenceLine, index]))
    }

    if (/\bconsole\.(?:log|info|warn|error)\s*\([^)]*(?:token|secret|password|apiKey|credential)/iu.test(line)) {
      findings.push(finding("sensitive-log", "security", "critical", sourcePath, lines, index))
    }

    if (/\bexec(?:Sync)?\s*\(\s*/u.test(line) && line.includes("`") && line.includes("${")) {
      findings.push(finding("dynamic-command", "security", "critical", sourcePath, lines, index))
    }

    if (/\bawait\b/u.test(line) && hasOpenForLoop(lines, index)) {
      findings.push(finding("await-in-loop", "performance", "major", sourcePath, lines, index))
    }

    if (/\b[A-Za-z_$][\w$]*\s*\[\s*0\s*\]\s*\.[A-Za-z_$][\w$]*/u.test(line)) {
      findings.push(finding("unchecked-index-access", "correctness", "major", sourcePath, lines, index))
    }

    const findBinding = line.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=.*\.find\s*\(/u)
    if (findBinding) findBindings.set(findBinding[1]!, index)
    for (const [name, declarationLine] of findBindings) {
      if (index <= declarationLine) continue
      const access = new RegExp(`\\b${name}\\s*\\.(?!\\?)`, "u")
      if (access.test(line) && !line.includes(`${name}?.`) && !lines.slice(declarationLine + 1, index).some((entry) =>
        new RegExp(`\\bif\\s*\\([^)]*${name}`, "u").test(entry))) {
        findings.push(finding("unchecked-find-result", "correctness", "major", sourcePath, lines, index, [declarationLine, index]))
        findBindings.delete(name)
      }
    }
  }

  const unique = [...new Map(findings.map((entry) => [`${entry.ruleId}:${entry.line}`, entry])).values()]
    .sort((left, right) => left.line - right.line || left.ruleId.localeCompare(right.ruleId))
  return unique.length > 0
    ? { status: "confirmed", findings: unique }
    : { status: "unconfirmed", reason: "no-supported-observable-pattern" }
}
