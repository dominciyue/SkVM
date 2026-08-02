import { parse as parseToml } from "smol-toml"

export type ZhReadmeCommandRole = "installation" | "quickstart" | "development"

export interface ZhReadmeCommandFact {
  role: ZhReadmeCommandRole
  command: string
  sourcePath: string
}

export interface ZhReadmeConfirmedFacts {
  status: "confirmed"
  manifestType: "node" | "python"
  project: { name: string; description: string; license?: string }
  commands: ZhReadmeCommandFact[]
  paths: string[]
  links: string[]
}

export type ZhReadmeFacts = ZhReadmeConfirmedFacts | {
  status: "unconfirmed"
  reason: "supported-manifest-missing" | "project-identity-missing" | "manifest-invalid"
}

type UnknownRecord = Record<string, unknown>

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function repositoryUrl(value: unknown): string | undefined {
  if (typeof value === "string") return nonEmpty(value)
  if (value && typeof value === "object") return nonEmpty((value as UnknownRecord).url)
  return undefined
}

function licenseFromFile(files: Record<string, string>): string | undefined {
  const license = files.LICENSE ?? files["LICENSE.md"] ?? files["LICENSE.txt"]
  if (!license) return undefined
  if (/Apache License[\s\S]*Version 2\.0/iu.test(license)) return "Apache-2.0"
  if (/BSD 3-Clause/iu.test(license)) return "BSD-3-Clause"
  if (/MIT License/iu.test(license)) return "MIT"
  return undefined
}

function markdownCommands(files: Record<string, string>): ZhReadmeCommandFact[] {
  const commands: ZhReadmeCommandFact[] = []
  for (const [sourcePath, text] of Object.entries(files)) {
    if (!/\.md$/iu.test(sourcePath)) continue
    for (const match of text.matchAll(/```(?:bash|sh|shell|console)?\s*\n([\s\S]*?)```/giu)) {
      for (const rawLine of match[1]!.split(/\r?\n/u)) {
        const command = rawLine.trim().replace(/^\$\s*/u, "")
        if (!command || command.startsWith("#")) continue
        const role: ZhReadmeCommandRole = /(?:pip install|npm install|pnpm install|yarn install)/iu.test(command)
          ? "installation"
          : /(?:pytest|unittest|\btest\b|\blint\b|compileall)/iu.test(command)
            ? "development"
            : "quickstart"
        commands.push({ role, command, sourcePath })
      }
    }
  }
  return commands
}

function sourceUsage(files: Record<string, string>): ZhReadmeCommandFact[] {
  const commands: ZhReadmeCommandFact[] = []
  for (const [sourcePath, text] of Object.entries(files)) {
    if (!/\.(?:[cm]?js|py)$/iu.test(sourcePath)) continue
    for (const match of text.matchAll(/(?:^|\n)\s*(?:\/\/|#)\s*Usage:\s*([^\r\n]+)/giu)) {
      commands.push({ role: "quickstart", command: match[1]!.trim(), sourcePath })
    }
  }
  return commands
}

function dedupeCommands(commands: ZhReadmeCommandFact[]): ZhReadmeCommandFact[] {
  const seen = new Set<string>()
  return commands.filter((entry) => {
    if (seen.has(entry.command)) return false
    seen.add(entry.command)
    return true
  })
}

function sourcePaths(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter((entry) => /^(?:src|docs|test|tests)\//u.test(entry))
    .sort()
}

function deriveNode(files: Record<string, string>): ZhReadmeFacts {
  let manifest: UnknownRecord
  try {
    manifest = JSON.parse(files["package.json"]!) as UnknownRecord
  } catch {
    return { status: "unconfirmed", reason: "manifest-invalid" }
  }
  const name = nonEmpty(manifest.name)
  const description = nonEmpty(manifest.description)
  if (!name || !description) return { status: "unconfirmed", reason: "project-identity-missing" }

  const commands: ZhReadmeCommandFact[] = [...markdownCommands(files), ...sourceUsage(files)]
  if (!commands.some((entry) => entry.role === "installation")) {
    commands.unshift({ role: "installation", command: "npm install", sourcePath: "package.json" })
  }
  const scripts = manifest.scripts && typeof manifest.scripts === "object" ? manifest.scripts as UnknownRecord : {}
  for (const key of Object.keys(scripts).sort()) {
    const role: ZhReadmeCommandRole = key === "start" ? "quickstart" : "development"
    const command = key === "test" ? "npm test" : `npm run ${key}`
    commands.push({ role, command, sourcePath: "package.json" })
  }
  if (!commands.some((entry) => entry.role === "quickstart")) {
    const bins = manifest.bin && typeof manifest.bin === "object" ? Object.keys(manifest.bin as UnknownRecord) : []
    if (bins[0]) commands.push({ role: "quickstart", command: `${bins[0]} --help`, sourcePath: "package.json" })
  }

  return {
    status: "confirmed",
    manifestType: "node",
    project: { name, description, license: nonEmpty(manifest.license) ?? licenseFromFile(files) },
    commands: dedupeCommands(commands),
    paths: sourcePaths(files),
    links: unique([nonEmpty(manifest.homepage), repositoryUrl(manifest.repository)].filter((entry): entry is string => Boolean(entry))),
  }
}

function derivePython(files: Record<string, string>): ZhReadmeFacts {
  let manifest: UnknownRecord
  try {
    manifest = parseToml(files["pyproject.toml"]!) as UnknownRecord
  } catch {
    return { status: "unconfirmed", reason: "manifest-invalid" }
  }
  const project = manifest.project && typeof manifest.project === "object" ? manifest.project as UnknownRecord : {}
  const name = nonEmpty(project.name)
  const description = nonEmpty(project.description)
  if (!name || !description) return { status: "unconfirmed", reason: "project-identity-missing" }
  const licenseValue = project.license && typeof project.license === "object"
    ? nonEmpty((project.license as UnknownRecord).text)
    : nonEmpty(project.license)
  const linksRecord = project.urls && typeof project.urls === "object" ? project.urls as UnknownRecord : {}
  const commands = markdownCommands(files)
  if (!commands.some((entry) => entry.role === "installation")) {
    commands.unshift({ role: "installation", command: "python -m pip install .", sourcePath: "pyproject.toml" })
  }
  if (!commands.some((entry) => entry.role === "quickstart")) {
    const scripts = project.scripts && typeof project.scripts === "object" ? Object.keys(project.scripts as UnknownRecord) : []
    if (scripts[0]) commands.push({ role: "quickstart", command: `${scripts[0]} --help`, sourcePath: "pyproject.toml" })
  }

  return {
    status: "confirmed",
    manifestType: "python",
    project: { name, description, license: licenseValue ?? licenseFromFile(files) },
    commands: dedupeCommands(commands),
    paths: sourcePaths(files),
    links: unique(Object.values(linksRecord).map(nonEmpty).filter((entry): entry is string => Boolean(entry))),
  }
}

export function deriveZhReadmeFacts(files: Record<string, string>): ZhReadmeFacts {
  if (files["package.json"] !== undefined) return deriveNode(files)
  if (files["pyproject.toml"] !== undefined) return derivePython(files)
  return { status: "unconfirmed", reason: "supported-manifest-missing" }
}
