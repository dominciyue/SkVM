import path from "node:path"
import { readFile, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import type { ZeroDispatchInspection } from "../authorization-guided-runtime-v1/study.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
/** This is an independently recorded initialization inspection, never an inference from an absent trace. */
export async function inspectNativeZeroDispatch(output: string): Promise<ZeroDispatchInspection | undefined> {
  const proof = await json(path.join(output, "zero-dispatch-inspection.json")).catch(error => { if (error.code === "ENOENT") return undefined; throw error })
  if (!proof) return undefined
  const bound = async (name: string) => {
    const item = proof.evidence?.find((e: any) => e.path === name), file = path.resolve(output, name), relative = path.relative(path.resolve(output), file)
    if (!item || !relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Invalid native inspection evidence")
    const bytes = await readFile(file)
    if (hash(bytes) !== item.sha256) throw new Error("Changed native inspection evidence")
    return bytes
  }
  const claimBytes = await bound("claim.json"), reportBytes = await bound("report.json"), claim = JSON.parse(claimBytes.toString()), retained = JSON.parse(reportBytes.toString())
  if (proof.schemaVersion !== "authorization-native-zero-dispatch/v1" || proof.verifiedStatus !== "input-invalid-before-dispatch" || proof.providerDispatches !== 0 || proof.claimSha256 !== hash(claimBytes) || proof.reportSha256 !== hash(reportBytes) || proof.implementationRevision !== claim.revision || !isDeepStrictEqual(claim, retained.identity) || claim.row?.kind !== "native" || retained.report?.status !== "completion-unknown" || retained.report.exitCode !== 1 || retained.report.providerDispatches != null && retained.report.providerDispatches !== 0 || retained.report.telemetry?.providerCalls > 0 || (retained.report.attempts ?? []).length) throw new Error("Native inspection identity/dispatch mismatch")
  const ordinary = JSON.parse((await bound("ordinary-claim.json")).toString()), scope = JSON.parse((await bound("scope.json")).toString()), session = JSON.parse((await bound("source-capture/cli-session.json")).toString()), order = JSON.parse((await bound("source-capture/initialization-order.json")).toString())
  const stdout = (await bound("stdout.txt")).toString().replace(/\x1b\[[0-9;]*m/g, ""), stderr = (await bound("stderr.txt")).toString(), prompt = ordinary.args?.find((arg: string) => arg.startsWith("--prompt="))?.slice(9), taskKey = prompt && `natural-${hash(prompt).slice(0, 12)}`
  if (!isDeepStrictEqual(session.argv?.slice(2), ordinary.args) || taskKey !== proof.taskKey || !taskKey || !stdout.includes(taskKey) || !new RegExp(`Task(?: ${taskKey})? failed\\s*\\(0s\\)`).test(stdout) || !path.isAbsolute(scope.sourceRoot) || !/Use a relative sourceRoot/.test(stderr) || ordinary.revision !== claim.revision || order.revision !== claim.revision || order.kind !== "independent-code-order-review" || order.loadInquiryInputBeforeProviderComplete !== true || order.providerConstructionDispatches !== false || !Array.isArray(order.reviewers) || new Set(order.reviewers).size < 2 || !Array.isArray(order.anchors) || order.anchors.length < 3) throw new Error("Native initialization inspection does not establish the named pre-provider failure")
  // Reproduce the exact public-loader rejection without constructing a provider.
  let error: any
  try { await loadInquiryInput(path.join(output, "scope.json")) } catch (cause) { error = cause }
  if (error?.issues?.length !== 1 || error.issues[0]?.message !== "Use a relative sourceRoot" || error.issues[0]?.path?.join(".") !== "sourceRoot") throw new Error("Native inspection failure no longer matches its original input")
  for (const name of ["native-trace.json", "sessions.jsonl", "dispatch.json", "events.jsonl"]) if (await stat(path.join(output, name)).catch(() => undefined)) throw new Error("Native inspection has additional request evidence; inspect before release")
  for (const item of proof.evidence) await bound(item.path)
  return { status: "input-invalid-before-dispatch", providerDispatches: 0, claimSha256: proof.claimSha256, reportSha256: proof.reportSha256, evidence: proof.evidence }
}
