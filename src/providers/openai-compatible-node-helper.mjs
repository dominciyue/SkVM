import http from "node:http"
import https from "node:https"

const MAX_REQUEST_BYTES = 32 * 1024 * 1024
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024

async function readInput() {
  const chunks = []
  let length = 0
  for await (const chunk of process.stdin) {
    length += chunk.length
    if (length > MAX_REQUEST_BYTES) throw new Error("request-too-large")
    chunks.push(chunk)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (
    typeof value !== "object" || value === null
    || typeof value.url !== "string"
    || typeof value.apiKey !== "string"
    || typeof value.body !== "object" || value.body === null
    || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1
  ) throw new Error("invalid-input")
  return value
}

function request(input) {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      reject(new Error("unsupported-protocol"))
      return
    }
    const body = Buffer.from(JSON.stringify(input.body), "utf8")
    const client = url.protocol === "https:" ? https : http
    const req = client.request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-length": String(body.length),
      },
    }, (response) => {
      const chunks = []
      let length = 0
      response.on("data", (chunk) => {
        length += chunk.length
        if (length > MAX_RESPONSE_BYTES) {
          response.destroy(new Error("response-too-large"))
          return
        }
        chunks.push(chunk)
      })
      response.on("end", () => {
        const headers = {}
        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value)
        }
        resolve({
          status: response.statusCode ?? 500,
          headers,
          body: Buffer.concat(chunks).toString("utf8"),
        })
      })
      response.on("error", reject)
    })
    req.setTimeout(input.timeoutMs, () => req.destroy(new Error("timeout")))
    req.on("error", reject)
    req.end(body)
  })
}

try {
  const result = await request(await readInput())
  process.stdout.write(JSON.stringify(result))
} catch {
  process.stderr.write("node-http-helper-network-error\n")
  process.exitCode = 2
}
