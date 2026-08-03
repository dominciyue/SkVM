import { realpath } from "node:fs/promises"
import path from "node:path"

export type SourceBoundCommandSlotKind = "placeholder" | "repository-path"

export interface SourceBoundCommandSlot {
  tokenIndex: number
  allowed: readonly SourceBoundCommandSlotKind[]
}

export interface SourceBoundCommandContract {
  variants: readonly string[]
  slots: readonly SourceBoundCommandSlot[]
}

export type SourceBoundCommandMatchReason =
  | "exact-variant"
  | "declared-slot"
  | "no-public-variant"
  | "shell-control"
  | "invalid-command-syntax"
  | "token-count-mismatch"
  | "literal-token-mismatch"
  | "slot-policy-mismatch"
  | "repository-path-absolute"
  | "repository-path-escape"
  | "repository-path-missing"
  | "repository-path-symlink-escape"

export type SourceBoundCommandMatch =
  | { status: "matched"; reason: "exact-variant" | "declared-slot"; variant: string }
  | { status: "rejected"; reason: Exclude<SourceBoundCommandMatchReason, "exact-variant" | "declared-slot" | "no-public-variant"> }
  | { status: "unconfirmed"; reason: "no-public-variant" }

type TokenizeResult =
  | { status: "ok"; tokens: string[] }
  | { status: "error"; reason: "shell-control" | "invalid-command-syntax" }

function tokenizeCommand(command: string): TokenizeResult {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | "\"" | undefined

  const push = () => {
    if (current.length > 0) tokens.push(current)
    current = ""
  }

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!
    if (quote) {
      if (character === quote) quote = undefined
      else current += character
      continue
    }
    if (character === "'" || character === "\"") {
      quote = character
      continue
    }
    if (/\s/u.test(character)) {
      push()
      continue
    }
    if (character === "<" && current.length === 0) {
      const closing = command.indexOf(">", index + 1)
      if (closing > index + 1 && (closing + 1 === command.length || /\s/u.test(command[closing + 1]!))) {
        current = command.slice(index, closing + 1)
        index = closing
        continue
      }
    }
    if ([";", "|", "&", ">", "<", "\n", "\r"].includes(character)) {
      return { status: "error", reason: "shell-control" }
    }
    current += character
  }
  if (quote) return { status: "error", reason: "invalid-command-syntax" }
  push()
  return tokens.length > 0
    ? { status: "ok", tokens }
    : { status: "error", reason: "invalid-command-syntax" }
}

function isWholePlaceholder(token: string): boolean {
  return /^<[^<>\r\n]+>$/u.test(token)
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

async function validateRepositoryPath(
  token: string,
  repositoryRoot: string,
): Promise<SourceBoundCommandMatchReason | undefined> {
  if (path.isAbsolute(token) || /^[a-zA-Z]:[\\/]/u.test(token)) return "repository-path-absolute"
  const normalizedParts = token.replaceAll("\\", "/").split("/")
  if (normalizedParts.includes("..")) return "repository-path-escape"

  const root = await realpath(repositoryRoot)
  const candidate = path.resolve(root, token)
  if (!isWithinRoot(root, candidate)) return "repository-path-escape"
  let resolved: string
  try {
    resolved = await realpath(candidate)
  } catch {
    return "repository-path-missing"
  }
  return isWithinRoot(root, resolved) ? undefined : "repository-path-symlink-escape"
}

async function matchVariant(input: {
  observedTokens: readonly string[]
  variant: string
  contract: SourceBoundCommandContract
  repositoryRoot: string
}): Promise<SourceBoundCommandMatch> {
  const expected = tokenizeCommand(input.variant)
  if (expected.status === "error") return { status: "rejected", reason: expected.reason }
  if (expected.tokens.length !== input.observedTokens.length) {
    return { status: "rejected", reason: "token-count-mismatch" }
  }

  const slots = new Map(input.contract.slots.map((slot) => [slot.tokenIndex, slot]))
  let substituted = false
  for (let index = 0; index < expected.tokens.length; index += 1) {
    const expectedToken = expected.tokens[index]!
    const observedToken = input.observedTokens[index]!
    if (observedToken === expectedToken) continue
    const slot = slots.get(index)
    if (!slot) return { status: "rejected", reason: "literal-token-mismatch" }

    if (slot.allowed.includes("placeholder") && isWholePlaceholder(observedToken)) {
      substituted = true
      continue
    }
    if (slot.allowed.includes("repository-path")) {
      const failure = await validateRepositoryPath(observedToken, input.repositoryRoot)
      if (!failure) {
        substituted = true
        continue
      }
      return { status: "rejected", reason: failure as Exclude<SourceBoundCommandMatchReason, "exact-variant" | "declared-slot" | "no-public-variant"> }
    }
    return { status: "rejected", reason: "slot-policy-mismatch" }
  }
  return {
    status: "matched",
    reason: substituted ? "declared-slot" : "exact-variant",
    variant: input.variant,
  }
}

export async function matchSourceBoundCommand(
  observed: string,
  contract: SourceBoundCommandContract,
  repositoryRoot: string,
): Promise<SourceBoundCommandMatch> {
  if (contract.variants.length === 0) return { status: "unconfirmed", reason: "no-public-variant" }
  const actual = tokenizeCommand(observed.trim())
  if (actual.status === "error") return { status: "rejected", reason: actual.reason }

  let firstFailure: SourceBoundCommandMatch | undefined
  for (const variant of contract.variants) {
    const result = await matchVariant({
      observedTokens: actual.tokens,
      variant,
      contract,
      repositoryRoot,
    })
    if (result.status === "matched") return result
    firstFailure ??= result
  }
  return firstFailure ?? { status: "rejected", reason: "literal-token-mismatch" }
}
