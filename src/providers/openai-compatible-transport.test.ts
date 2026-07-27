import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { OpenAICompatibleProvider } from "./openai-compatible.ts"
import {
  createOpenAICompatibleHttpTransport,
  requestViaNodeHttpHelper,
  type OpenAICompatibleHttpTransport,
} from "./openai-compatible-transport.ts"

const tempDirs: string[] = []
const servers: ReturnType<typeof Bun.serve>[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop(true)
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("OpenAI-compatible Node HTTP transport", () => {
  test("posts the request through the Node helper without placing the API key in argv", async () => {
    let observed: { authorization: string | null; body: unknown } | undefined
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        observed = {
          authorization: request.headers.get("authorization"),
          body: await request.json(),
        }
        return Response.json({ ok: true }, { headers: { "x-test": "node-helper" } })
      },
    })
    servers.push(server)
    const nodeExecutable = Bun.which("node")
    expect(nodeExecutable).toBeTruthy()
    const helperPath = path.join(import.meta.dir, "openai-compatible-node-helper.mjs")

    const response = await requestViaNodeHttpHelper({
      nodeExecutable: nodeExecutable!,
      helperPath,
      url: `${server.url}v1/chat/completions`,
      apiKey: "TEST_ONLY_SECRET_KEY",
      body: { model: "test-model", messages: [] },
      timeoutMs: 5_000,
    })

    expect(response).toMatchObject({ status: 200, headers: { "x-test": "node-helper" } })
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(observed).toEqual({
      authorization: "Bearer TEST_ONLY_SECRET_KEY",
      body: { model: "test-model", messages: [] },
    })
  })

  test("fails closed when the helper emits invalid JSON", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skvm-node-http-invalid-"))
    tempDirs.push(dir)
    const helperPath = path.join(dir, "invalid-helper.mjs")
    await writeFile(helperPath, "process.stdout.write('not-json')\n", "utf8")

    await expect(requestViaNodeHttpHelper({
      nodeExecutable: Bun.which("node")!,
      helperPath,
      url: "http://127.0.0.1:1/v1/chat/completions",
      apiKey: "TEST_ONLY_SECRET_KEY",
      body: {},
      timeoutMs: 1_000,
    })).rejects.toThrow("invalid JSON")
  })

  test("requires both lock-projected helper paths or neither", () => {
    expect(createOpenAICompatibleHttpTransport({})).toBeUndefined()
    expect(() => createOpenAICompatibleHttpTransport({
      SKVM_OPENAI_HTTP_NODE: "node",
    })).toThrow("both")
    expect(() => createOpenAICompatibleHttpTransport({
      SKVM_OPENAI_HTTP_HELPER: "helper.mjs",
    })).toThrow("both")
    expect(createOpenAICompatibleHttpTransport({
      SKVM_OPENAI_HTTP_NODE: "node",
      SKVM_OPENAI_HTTP_HELPER: "helper.mjs",
    })).toBeFunction()
  })

  test("uses an explicitly injected transport without calling the default fetch path", async () => {
    const fallback = Bun.serve({ port: 0, fetch: () => new Response("wrong transport", { status: 418 }) })
    servers.push(fallback)
    const calls: Parameters<OpenAICompatibleHttpTransport>[0][] = []
    const transport: OpenAICompatibleHttpTransport = async (request) => {
      calls.push(request)
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          choices: [{ message: { content: "helper response" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
      }
    }
    const provider = new OpenAICompatibleProvider({
      apiKey: "TEST_ONLY_SECRET_KEY",
      model: "test-model",
      baseUrl: `${fallback.url}v1`,
      transport,
    })

    const result = await provider.complete({ messages: [{ role: "user", content: "hello" }] })

    expect(result).toMatchObject({ text: "helper response", tokens: { input: 3, output: 2 } })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      url: `${fallback.url}v1/chat/completions`,
      apiKey: "TEST_ONLY_SECRET_KEY",
    })
  })
})
