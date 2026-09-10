import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "yaml";

export type Response = { status: number; headers: Record<string, string>; body: Buffer };
export type Request = (endpoint: string) => Promise<Response>;
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

export class AcquisitionError extends Error {
  constructor(public status: number, public category: string, public retryAt: string | null) {
    super(`acquisition HTTP ${status}: ${category}${retryAt ? `; retry at ${retryAt}` : ""}`);
  }
}

/** Successful entries are immutable; failed attempts stay in the append-only journal. */
export async function createAcquirer(root: string, request: Request = ghRequest) {
  await mkdir(join(root, "cache"), { recursive: true });
  const journal = join(root, "acquisition.jsonl");
  const pending = new Map<string, Promise<Response>>();
  async function getOnce(endpoint: string): Promise<Response> {
    const file = join(root, "cache", `${digest(endpoint)}.json`);
    try {
      const cached = JSON.parse(await readFile(file, "utf8"));
      const body = Buffer.from(cached.body, "base64");
      if (cached.endpoint !== endpoint || cached.status !== 200 || digest(body) !== cached.sha256) {
        throw new Error(`cache integrity failure: ${endpoint}`);
      }
      return { status: cached.status, headers: cached.headers, body };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const startedAt = new Date().toISOString();
    let response: Response;
    try { response = await request(endpoint); }
    catch {
      await appendFile(journal, JSON.stringify({ endpoint, startedAt, status: 0, category: "transport-failure" }) + "\n");
      throw new AcquisitionError(0, "transport-failure", null);
    }
    const headers = Object.fromEntries(Object.entries(response.headers).map(([k, v]) => [k.toLowerCase(), v]));
    const rateLimited = response.status === 429 || (response.status === 403 &&
      (headers["x-ratelimit-remaining"] === "0" || !!headers["retry-after"]));
    const seconds = Number(headers["retry-after"]);
    const reset = Number(headers["x-ratelimit-reset"]);
    const retryAt = rateLimited ? (headers["retry-after"] && Number.isFinite(seconds)
      ? new Date(Date.now() + seconds * 1000).toISOString()
      : reset > 0 ? new Date(reset * 1000).toISOString() : null) : null;
    const category = response.status === 200 ? "success" : rateLimited ? "rate-limit"
      : [401, 403].includes(response.status) ? "permission" : response.status >= 500 ? "transient" : "http-failure";
    await appendFile(journal, JSON.stringify({ endpoint, startedAt, status: response.status, category,
      retryAfter: headers["retry-after"] ?? null, retryAt, byteLength: response.body.length, sha256: digest(response.body) }) + "\n");
    if (response.status !== 200) throw new AcquisitionError(response.status, category, retryAt);
    await writeFile(file, JSON.stringify({ endpoint, status: 200, headers, sha256: digest(response.body), body: response.body.toString("base64") }), { flag: "wx" });
    return { ...response, headers };
  }
  return {
    get(endpoint: string) {
      const active = pending.get(endpoint);
      if (active) return active;
      const promise = getOnce(endpoint).finally(() => pending.delete(endpoint));
      pending.set(endpoint, promise);
      return promise;
    },
  };
}

/** gh obtains credentials itself; neither tokens nor credential-bearing headers are emitted. */
export async function ghRequest(endpoint: string): Promise<Response> {
  if (!/^(repos\/|search\/|rate_limit$)/u.test(endpoint) || /[\r\n]/u.test(endpoint)) {
    throw new Error("expected a GitHub repository/search endpoint");
  }
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn("gh", ["api", "--hostname", "github.com", "--method", "GET", "--include", endpoint],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    let exceeded = false;
    const timer = setTimeout(() => child.kill(), 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024 * 1024) { exceeded = true; child.kill(); }
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on("error", () => { clearTimeout(timer); reject(new Error("gh process unavailable")); });
    child.on("close", () => {
      clearTimeout(timer);
      if (exceeded) reject(new Error("GitHub response exceeds 64 MiB"));
      else resolve(Buffer.concat(chunks));
    });
  });
  const text = bytes.toString("utf8");
  const boundary = /\r?\n\r?\n/u.exec(text);
  if (!boundary) throw new Error("gh did not return HTTP headers");
  const head = text.slice(0, boundary.index);
  const status = Number(/^HTTP\/\S+\s+(\d+)/u.exec(head)?.[1]);
  if (!status) throw new Error("invalid gh HTTP status");
  const headers: Record<string, string> = {};
  for (const line of head.split(/\r?\n/u).slice(1)) {
    const index = line.indexOf(":");
    if (index > 0) headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
  }
  // API endpoints here return JSON; blob contents are base64 inside JSON.
  return { status, headers, body: Buffer.from(text.slice(boundary.index + boundary[0].length)) };
}

export function qualifySource(bytes: Buffer, format: "json" | "yaml") {
  try {
    const yaml = format === "yaml" ? parseDocument(bytes.toString("utf8"), { uniqueKeys: true }) : null;
    if (yaml?.errors.length) return { eligible: false, reason: "parse failure" };
    const document = yaml ? yaml.toJS() : JSON.parse(bytes.toString("utf8"));
    const eligible = typeof document?.openapi === "string" && /^3\./u.test(document.openapi) &&
      document.paths !== null && typeof document.paths === "object" && !Array.isArray(document.paths);
    return { eligible, reason: eligible ? null : "requires OpenAPI 3 document with paths" };
  } catch { return { eligible: false, reason: "parse failure" }; }
}
