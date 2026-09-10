#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function usage() {
  console.error(`Usage: scaffold-openapi.mjs [--out openapi.yaml] [--title "Example API"] [--version 1.0.0] [--server http://localhost:3000] [--openapi 3.1.0]

Creates a minimal OpenAPI description with a /health operation.`);
}

function readFlag(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${name}`);
    usage();
    process.exit(2);
  }
  return value;
}

if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const out = readFlag("--out", "openapi.yaml");
const title = readFlag("--title", "Example API");
const version = readFlag("--version", "1.0.0");
const server = readFlag("--server", "http://localhost:3000");
const openapi = readFlag("--openapi", "3.1.0");

const document = {
  openapi,
  info: {
    title,
    version,
    description: "Replace this scaffold with the API contract that clients can rely on."
  },
  servers: [{ url: server }],
  tags: [{ name: "health", description: "Service health and readiness checks" }],
  paths: {
    "/health": {
      get: {
        tags: ["health"],
        operationId: "getHealth",
        summary: "Return service health",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                examples: {
                  ok: { value: { status: "ok" } }
                }
              }
            }
          },
          "500": { $ref: "#/components/responses/InternalError" }
        }
      }
    }
  },
  components: {
    schemas: {
      HealthResponse: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["ok"] }
        }
      },
      Error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          requestId: { type: "string" }
        }
      }
    },
    responses: {
      InternalError: {
        description: "Unexpected server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" }
          }
        }
      }
    }
  }
};

function yamlString(value) {
  return JSON.stringify(String(value));
}

function renderYaml() {
  return `openapi: ${yamlString(document.openapi)}
info:
  title: ${yamlString(document.info.title)}
  version: ${yamlString(document.info.version)}
  description: ${yamlString(document.info.description)}
servers:
  - url: ${yamlString(server)}
tags:
  - name: health
    description: Service health and readiness checks
paths:
  /health:
    get:
      tags:
        - health
      operationId: getHealth
      summary: Return service health
      responses:
        "200":
          description: Service is healthy
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthResponse"
              examples:
                ok:
                  value:
                    status: ok
        "500":
          $ref: "#/components/responses/InternalError"
components:
  schemas:
    HealthResponse:
      type: object
      required:
        - status
      properties:
        status:
          type: string
          enum:
            - ok
    Error:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: string
        message:
          type: string
        requestId:
          type: string
  responses:
    InternalError:
      description: Unexpected server error
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/Error"
`;
}

const dir = path.dirname(path.resolve(out));
fs.mkdirSync(dir, { recursive: true });
const content = out.endsWith(".json")
  ? `${JSON.stringify(document, null, 2)}\n`
  : renderYaml();
fs.writeFileSync(out, content);
console.log(`Created ${out}`);
