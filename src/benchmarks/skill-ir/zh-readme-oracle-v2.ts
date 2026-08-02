import {
  deriveZhReadmeFacts,
  type ZhReadmeCommandFact,
  type ZhReadmeFacts,
} from "./zh-readme-oracle.ts"

export type ZhReadmeCommandFactV2 = ZhReadmeCommandFact & { equivalents: string[] }
export type ZhReadmeConfirmedFactsV2 = Omit<Extract<ZhReadmeFacts, { status: "confirmed" }>, "commands"> & {
  commands: ZhReadmeCommandFactV2[]
}
export type ZhReadmeFactsV2 = ZhReadmeConfirmedFactsV2 | Exclude<ZhReadmeFacts, { status: "confirmed" }>

function markdownDeclares(files: Record<string, string>, command: string): boolean {
  return Object.entries(files).some(([filePath, text]) => /\.md$/iu.test(filePath) && text.includes(command))
}

function nodeScripts(files: Record<string, string>): Record<string, string> {
  try {
    const manifest = JSON.parse(files["package.json"] ?? "{}") as { scripts?: Record<string, unknown> }
    return Object.fromEntries(Object.entries(manifest.scripts ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([name, command]) => [name, command.trim()]))
  } catch {
    return {}
  }
}

function commandEquivalents(command: string, scripts: Record<string, string>): string[] {
  const values = new Set([command])
  if (command === "npm test" && scripts.test) {
    values.add("npm run test")
    values.add(scripts.test)
  } else {
    const match = /^npm run ([a-zA-Z0-9:_-]+)$/u.exec(command)
    if (match) {
      const scriptName = match[1]!
      if (scriptName === "start") values.add("npm start")
      if (scripts[scriptName]) values.add(scripts[scriptName]!)
    }
  }
  return [...values]
}

export function deriveZhReadmeFactsV2(files: Record<string, string>): ZhReadmeFactsV2 {
  const base = deriveZhReadmeFacts(files)
  if (base.status !== "confirmed") return base
  const scripts = base.manifestType === "node" ? nodeScripts(files) : {}
  const commands = base.commands
    .filter((entry) => !(base.manifestType === "node"
      && entry.command === "npm install"
      && entry.sourcePath === "package.json"
      && !markdownDeclares(files, entry.command)))
    .map((entry) => ({ ...entry, equivalents: commandEquivalents(entry.command, scripts) }))
  return { ...base, commands }
}

function commandTokens(command: string): string[] {
  return command.trim().replace(/<[^>]+>/gu, "<ARG>").split(/\s+/u).filter(Boolean)
}

function boundedPlaceholderMatch(observed: string, expected: string): boolean {
  const actualTokens = commandTokens(observed)
  const expectedTokens = commandTokens(expected)
  if (actualTokens.length !== expectedTokens.length || !actualTokens.includes("<ARG>")) return false
  return actualTokens.every((token, index) => token === expectedTokens[index]
    || (token === "<ARG>" && !expectedTokens[index]!.startsWith("-")))
}

export function matchesZhReadmeCommand(
  observed: string,
  facts: readonly ZhReadmeCommandFactV2[],
): boolean {
  return facts.some((fact) => fact.equivalents.some((candidate) =>
    observed.trim() === candidate || boundedPlaceholderMatch(observed, candidate)))
}

export function matchesZhReadmeLicense(markdown: string, license: string): boolean {
  const normalized = markdown.toLocaleLowerCase("en-US")
  const aliases = license === "Apache-2.0"
    ? ["apache-2.0", "apache 2.0", "apache license 2.0", "apache license version 2.0"]
    : license === "BSD-3-Clause"
      ? ["bsd-3-clause", "bsd 3-clause", "bsd 3 clause"]
      : license === "MIT"
        ? ["mit", "mit license"]
        : [license.toLocaleLowerCase("en-US")]
  return aliases.some((alias) => normalized.includes(alias))
}
