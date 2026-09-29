import { appendFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { prepareAuthorizationEvidence } from "../benchmarks/authorization-dsl/evidence-preparation/prepare.ts"
import { reusePreparedMaterial } from "../benchmarks/authorization-dsl/evidence-preparation/material-reuse.ts"
import { AuthorizationDependencyProposalError, proposeAuthorizationDependencies, proposeBoundedAuthorizationDependencies, type AuthorizationProposalAccount } from "../benchmarks/authorization-dsl/evidence-preparation/proposal.ts"
import { discoverAuthorizationEvidence, type AuthorizationDiscovery } from "../benchmarks/authorization-dsl/evidence-preparation/discovery.ts"
import { authorizationScopePreview } from "../benchmarks/authorization-dsl/evidence-preparation/scope.ts"
import { loadLocalAuthorizationInput } from "../benchmarks/authorization-dsl/local-input.ts"
import type { LocalAuthorizationCliDependencies } from "../benchmarks/authorization-dsl/local-run.ts"

function optionsFor(args: string[]) {
  const options: Record<string, string> = {}
  for (const arg of args) {
    const matched = /^--(input|request|reuse|out|check-only|proposal-model|discover|proposal-timeout-ms|context)=(.+)$/.exec(arg)
    if (!matched || options[matched[1]!] !== undefined) throw new Error(`Invalid or duplicate prepare option: ${arg}`)
    options[matched[1]!] = matched[2]!
  }
  for (const key of ["input", "out"]) if (!options[key]) throw new Error(`prepare requires --${key}=<path>.`)
  if (!!options.request === !!options.reuse) throw new Error("prepare requires exactly one of --request or --reuse.")
  if (options.reuse && (options["proposal-model"] || options.discover || options.context)) throw new Error("--reuse retains existing context and calls no provider; omit proposal, discover and context options.")
  if (options["check-only"] && options["check-only"] !== "true" && options["check-only"] !== "false") throw new Error("--check-only must be true or false.")
  if (options["check-only"] === "true" && options["proposal-model"]) throw new Error("--proposal-model requires publication; check-only does not call a provider.")
  if (options.discover && !["true", "false"].includes(options.discover)) throw new Error("--discover must be true or false.")
  if (options.context && options.context !== "callable-v1") throw new Error("--context must be callable-v1 or omitted.")
  const timeoutMs = Number(options["proposal-timeout-ms"] ?? 300000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error("--proposal-timeout-ms must be 1..300000.")
  return { inputFile: path.resolve(options.input!), requestFile: options.request ? path.resolve(options.request) : undefined, reuseFile: options.reuse ? path.resolve(options.reuse) : undefined, outDir: path.resolve(options.out!), checkOnly: options["check-only"] === "true", proposalModel: options["proposal-model"], discover: options.discover === "true", timeoutMs, contextStrategy: options.context as "callable-v1" | undefined }
}

/** Publish ordinary input and source snapshots; opt-in discovery uses at most two position rounds and one format revision. */
export async function runAuthorizationPrepareCli(args: string[], dependencies: LocalAuthorizationCliDependencies): Promise<number> {
  let staging: string | undefined
  let parent: string | undefined
  let published = false
  let attemptPath: string | undefined
  let account: AuthorizationProposalAccount | undefined
  let outputPath: string | undefined
  try {
    const options = optionsFor(args)
    outputPath = options.outDir
    let request = options.requestFile ? JSON.parse(await readFile(options.requestFile, "utf8")) : undefined
    const reused = options.reuseFile ? await reusePreparedMaterial({ inputFile: options.inputFile, previousInputFile: options.reuseFile, outDir: options.outDir }) : undefined
    let prepared = reused ?? await prepareAuthorizationEvidence({ inputFile: options.inputFile, outDir: options.outDir, request, contextStrategy: options.contextStrategy })
    if (prepared.report.status === "invalid" || !prepared.preparedInput) {
      dependencies.stdout(JSON.stringify({ ...prepared.report, ...(reused ? { reuse: reused.reuse } : {}), ...(prepared.diagnostics ? { diagnostics: prepared.diagnostics } : {}), outputPath: null }, null, 2))
      return 1
    }
    if (reused) request = prepared.report.materialBinding!.request
    let discovery: AuthorizationDiscovery | undefined
    if (options.discover) {
      discovery = await discoverAuthorizationEvidence({ inputFile: options.inputFile, request, contextStrategy: options.contextStrategy })
      request = discovery.request
      prepared = await prepareAuthorizationEvidence({ inputFile: options.inputFile, outDir: options.outDir, request, contextStrategy: options.contextStrategy })
      if (!prepared.preparedInput) { dependencies.stdout(JSON.stringify({ ...prepared.report, discovery, outputPath: null }, null, 2)); return 1 }
    }
    const scopePreview = () => authorizationScopePreview(prepared.preparedInput!.task, request)
    if (options.checkOnly) {
      dependencies.stdout(JSON.stringify({ ...prepared.report, scopePreview: scopePreview(), ...(reused ? { reuse: reused.reuse } : {}), ...(discovery ? { discovery } : {}), outputPath: null }, null, 2))
      return 0
    }
    try { await lstat(options.outDir); throw new Error(`Output already exists: ${options.outDir}`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    parent = await realpath(path.dirname(options.outDir))
    // This creates and writes the intended publication staging area before any paid dispatch.
    staging = await mkdtemp(path.join(parent, ".authorization-prepare-"))
    await writeFile(path.join(staging, "write-check"), "preflight\n", { flag: "wx" })
    await rm(path.join(staging, "write-check"))
    let proposal: Awaited<ReturnType<typeof proposeAuthorizationDependencies>> | undefined
    if (options.proposalModel) {
      attemptPath = await mkdtemp(path.join(parent, `${path.basename(options.outDir)}.attempts-`))
      await writeFile(path.join(attemptPath, "job.json"), `${JSON.stringify({ inputFile: options.inputFile, requestFile: options.requestFile, model: options.proposalModel, outDir: options.outDir, createdAt: new Date().toISOString(), noAutomaticResend: true }, null, 2)}\n`, { flag: "wx" })
      if (discovery) await writeFile(path.join(attemptPath, "discovery.json"), `${JSON.stringify(discovery, null, 2)}\n`, "utf8")
      const provider = dependencies.providerFactory
        ? await dependencies.providerFactory(options.proposalModel)
        : await (await import("../providers/registry.ts")).createProviderForModel(options.proposalModel)
      const proposalOptions = { inputFile: options.inputFile, model: options.proposalModel, provider, timeoutMs: options.timeoutMs,
        onEvent: (event: import("../benchmarks/authorization-dsl/telemetry.ts").AuthorizationLifecycleEvent) => appendFile(path.join(attemptPath!, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8") }
      proposal = discovery ? await proposeBoundedAuthorizationDependencies({ ...proposalOptions, discovery, preparedReport: prepared.report }) : await proposeAuthorizationDependencies({ ...proposalOptions, request })
      account = proposal.account
      await writeFile(path.join(attemptPath, "account.json"), `${JSON.stringify(account, null, 2)}\n`, "utf8")
      request = { ...request, dependencies: [...request.dependencies, ...proposal.dependencies] }
      prepared = await prepareAuthorizationEvidence({ inputFile: options.inputFile, outDir: options.outDir, request, contextStrategy: options.contextStrategy, ...(discovery ? { expectedSourceDigests: Object.fromEntries(discovery.files.map(file => [file.path, file.sha256])) } : {}) })
      if (prepared.report.status === "invalid" || !prepared.preparedInput) {
        account.status = "rejected"
        account.diagnostics = prepared.report.gaps.map(gap => `${gap.id}: ${gap.reason}`)
        await writeFile(path.join(attemptPath, "account.json"), `${JSON.stringify(account, null, 2)}\n`, "utf8")
        dependencies.stdout(JSON.stringify({ ...prepared.report, proposal, attemptPath, outputPath: null }, null, 2))
        return 1
      }
      for (const gap of proposal.gaps ?? []) {
        const read = proposal.account.readOutcomes?.find(outcome => gap.id === `read:${outcome.requestId}` && outcome.status === "unresolved")
        prepared.report.gaps.push({ ...gap, ...(read && read.status === "unresolved" ? { requestId: read.requestId, ...(read.request.selector ? { selector: read.request.selector } : {}), candidates: read.candidates, budget: read.budget,
          next: read.code === "ambiguous" ? "Choose one candidate with an exact source range." : read.code === "display-budget" ? "Reduce the requested range within the shared display budget." : "Supply a readable source location or keep this evidence gap explicit." } : {}) })
      }
      if (prepared.report.gaps.length) prepared.report.status = "partial"
    }
    for (const snapshot of prepared.snapshots) {
      const target = path.join(staging, "source", ...snapshot.path.split("/"))
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, snapshot.content, { encoding: "utf8", flag: "wx" })
    }
    await writeFile(path.join(staging, "assessment.json"), `${JSON.stringify(prepared.preparedInput, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    await writeFile(path.join(staging, "report.json"), `${JSON.stringify(prepared.report, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    if (reused) await writeFile(path.join(staging, "reuse.json"), `${JSON.stringify(reused.reuse, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    if (proposal) await writeFile(path.join(staging, "proposal.json"), `${JSON.stringify(proposal, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    if (discovery) await writeFile(path.join(staging, "discovery.json"), `${JSON.stringify(discovery, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    const checked = await loadLocalAuthorizationInput(path.join(staging, "assessment.json"))
    if (checked.status !== "valid") throw new Error(`Prepared input failed local validation: ${checked.diagnostics.map(item => `${item.code}: ${item.message}`).join("; ")}`)
    await rename(staging, options.outDir)
    published = true
    if (account && attemptPath) {
      account.published = true
      await writeFile(path.join(attemptPath, "account.json"), `${JSON.stringify(account, null, 2)}\n`, "utf8")
    }
    dependencies.stdout(JSON.stringify({ ...prepared.report, scopePreview: scopePreview(), ...(reused ? { reuse: reused.reuse } : {}), ...(discovery ? { discoveryPath: path.join(options.outDir, "discovery.json") } : {}), ...(proposal ? { proposal, attemptPath } : {}), outputPath: options.outDir, inputPath: path.join(options.outDir, "assessment.json") }, null, 2))
    return 0
  } catch (error) {
    if (error instanceof AuthorizationDependencyProposalError) account = error.account
    if (attemptPath) {
      const message = error instanceof Error ? error.message : String(error)
      if (account) {
        account.published = published
        account.diagnostics = [...account.diagnostics, message]
        await writeFile(path.join(attemptPath, "account.json"), `${JSON.stringify(account, null, 2)}\n`, "utf8")
      }
      await writeFile(path.join(attemptPath, "failure.json"), `${JSON.stringify({ error: message, published, accountAvailable: !!account }, null, 2)}\n`, "utf8")
      dependencies.stdout(JSON.stringify({ status: "failed", attemptPath, outputPath: published ? outputPath : null, ...(account ? { telemetry: account.telemetry } : {}) }, null, 2))
    }
    dependencies.stderr(error instanceof Error ? error.message : String(error))
    return 1
  } finally {
    if (staging && parent && !published) {
      const relative = path.relative(parent, staging)
      if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
        try { await rm(staging, { recursive: true, force: false }) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") dependencies.stderr(`Could not clean prepare staging: ${String(error)}`) }
      }
    }
  }
}
