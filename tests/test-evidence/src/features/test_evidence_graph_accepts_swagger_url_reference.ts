import { type ChildProcess, spawn } from "node:child_process";

import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies HTTP Swagger references through the packaged native-to-Node bridge.
 *
 * A local file case cannot prove URL fetching survives the linked binary or
 * that a query string bypasses glob parsing. The server runs in a child process
 * because the synchronous compiler launch blocks this test process's event loop
 * while the request is in flight.
 *
 * 1. Serve one OpenAPI 3.1 document from a loopback HTTP child process.
 * 2. Configure its exact query-bearing URL as a Swagger reference.
 * 3. Assert the real compiler fetches, normalizes, and covers its GET operation.
 */
export const test_evidence_graph_accepts_swagger_url_reference =
  async (): Promise<void> => {
    const server: { child: ChildProcess; url: string } =
      await startSwaggerServer();
    let project: ITtscEvidenceProject | undefined;
    try {
      project = createProject({
        name: "swagger-url",
        lintConfig: [
          'import evidence from "@ttsc/evidence";',
          "",
          "export default {",
          '  plugins: { "evidence": evidence },',
          "  rules: {",
          '    "evidence/graph": ["error", {',
          "      claims: [{",
          '        type: "typescript",',
          '        files: ["src/**/*.ts"],',
          '        reference: { type: "swagger", file: ' +
            JSON.stringify(server.url) +
            " },",
          "      }],",
          "    }],",
          "  },",
          "};",
          "",
        ].join("\n"),
        files: {
          "src/members.ts": [
            "/** @evidence GET:/members/{id} Reads a member through the remote API contract. */",
            "export interface IMemberReader {}",
            "",
          ].join("\n"),
        },
      });
      const result = runCheck(project.directory);
      assertStatus(
        result,
        0,
        "The packaged rule must fetch and normalize an exact HTTP Swagger URL.",
      );
      assertExcludes(
        result,
        "Missing acknowledgement",
        "The URL-backed GET operation must participate in ordinary coverage.",
      );
    } finally {
      project?.cleanup();
      server.child.kill();
    }
  };

const startSwaggerServer = async (): Promise<{
  child: ChildProcess;
  url: string;
}> => {
  const document: string = JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Members", version: "1.0.0" },
    paths: {
      "/members/{id}": {
        get: {
          operationId: "members.get",
          responses: { 200: { description: "Found" } },
        },
      },
    },
  });
  const script: string = [
    'const http = require("node:http");',
    `const document = ${JSON.stringify(document)};`,
    "const server = http.createServer((request, response) => {",
    '  if (request.url !== "/openapi.json?revision=1") {',
    "    response.writeHead(404);",
    "    response.end();",
    "    return;",
    "  }",
    '  response.writeHead(200, { "content-type": "application/json" });',
    "  response.end(document);",
    "});",
    'server.listen(0, "127.0.0.1", () => {',
    '  process.stdout.write(String(server.address().port) + "\\n");',
    "});",
    'process.on("SIGTERM", () => server.close(() => process.exit(0)));',
    "",
  ].join("\n");
  const child: ChildProcess = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port: number = await new Promise<number>((resolve, reject) => {
    const timeout: NodeJS.Timeout = setTimeout(() => {
      reject(new Error("Timed out while starting the Swagger fixture server."));
    }, 10_000);
    let stdout: string = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line: string | undefined = stdout.split(/\r?\n/u)[0];
      if (line === undefined || /^\d+$/u.test(line) === false) return;
      clearTimeout(timeout);
      resolve(Number(line));
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Swagger fixture server exited before listening (status ${String(code)}).`,
        ),
      );
    });
  });
  return {
    child,
    url: `http://127.0.0.1:${port}/openapi.json?revision=1`,
  };
};
