/**
 * Single subprocess runner shared by the CLI-wrapping adapters and the
 * headless-agent drivers. Spawns with kill-on-timeout and drains
 * stdout/stderr in parallel with waiting for exit — draining concurrently
 * avoids pipe deadlock when the child's output exceeds the OS pipe buffer
 * (~64 KB on macOS) while the parent blocks on `proc.exited`.
 */

export interface SubprocessResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
  stoppedByStdoutLine?: boolean
  timeoutKind?: "absolute" | "idle"
  firstActivityMs?: number
  lastActivityMs?: number
}

export interface SubprocessOptions {
  /** Working directory for the child process. */
  cwd?: string
  /** Kill the child after this many milliseconds; `result.timedOut` is set. */
  timeoutMs?: number
  /** Kill the child after this much time without an accepted stdout line. */
  idleTimeoutMs?: number
  /** Return true only for stdout lines that prove useful execution activity. */
  isStdoutLineActivity?: (line: string) => boolean
  /** Return true to stop the child for a caller-defined observable limit. */
  shouldStopAfterStdoutLine?: (line: string) => boolean
  /**
   * Environment overlay merged over `process.env`. A value of `undefined`
   * removes that variable from the child's environment.
   */
  env?: Record<string, string | undefined>
}

export async function runSubprocess(
  cmd: string[],
  opts?: SubprocessOptions,
): Promise<SubprocessResult> {
  const env = opts?.env && Object.keys(opts.env).length > 0
    ? mergeEnv(process.env, opts.env)
    : process.env
  const start = Date.now()
  const proc = Bun.spawn(cmd, {
    cwd: opts?.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env,
  })

  let timedOut = false
  let timeoutKind: SubprocessResult["timeoutKind"]
  let stoppedByStdoutLine = false
  let finished = false
  let firstActivityMs: number | undefined
  let lastActivityMs: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const killForTimeout = (kind: NonNullable<SubprocessResult["timeoutKind"]>) => {
    if (finished || timedOut) return
    timedOut = true
    timeoutKind = kind
    proc.kill()
  }
  if (opts?.timeoutMs) {
    timer = setTimeout(() => killForTimeout("absolute"), opts.timeoutMs)
  }
  const resetIdleTimer = () => {
    if (!opts?.idleTimeoutMs || !opts.isStdoutLineActivity) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => killForTimeout("idle"), opts.idleTimeoutMs)
  }
  const acceptLine = (line: string) => {
    if (!finished && !timedOut && !stoppedByStdoutLine && opts?.shouldStopAfterStdoutLine) {
      let shouldStop = false
      try {
        shouldStop = opts.shouldStopAfterStdoutLine(line)
      } catch {
        shouldStop = false
      }
      if (shouldStop) {
        stoppedByStdoutLine = true
        proc.kill()
      }
    }
    if (!opts?.isStdoutLineActivity) return
    let active = false
    try {
      active = opts.isStdoutLineActivity(line)
    } catch {
      active = false
    }
    if (!active) return
    const elapsed = Date.now() - start
    firstActivityMs ??= elapsed
    lastActivityMs = elapsed
    resetIdleTimer()
  }
  resetIdleTimer()

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited.then((code) => {
      finished = true
      if (timer) clearTimeout(timer)
      if (idleTimer) clearTimeout(idleTimer)
      return code
    }),
    readStreamText(proc.stdout, acceptLine),
    new Response(proc.stderr).text(),
  ])
  return {
    exitCode,
    stdout,
    stderr,
    durationMs: Date.now() - start,
    timedOut,
    ...(stoppedByStdoutLine ? { stoppedByStdoutLine } : {}),
    ...(timeoutKind ? { timeoutKind } : {}),
    ...(firstActivityMs === undefined ? {} : { firstActivityMs, lastActivityMs }),
  }
}

async function readStreamText(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""
  let pending = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    output += chunk
    pending += chunk
    let newline = pending.indexOf("\n")
    while (newline >= 0) {
      onLine(pending.slice(0, newline).replace(/\r$/, ""))
      pending = pending.slice(newline + 1)
      newline = pending.indexOf("\n")
    }
  }
  const tail = decoder.decode()
  output += tail
  pending += tail
  if (pending.length > 0) onLine(pending.replace(/\r$/, ""))
  return output
}

function mergeEnv(
  base: NodeJS.ProcessEnv,
  overlay: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) if (typeof v === "string") out[k] = v
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined) delete out[k]
    else out[k] = v
  }
  return out
}
