import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies Swagger source failures remain visible through the real compiler.
 *
 * A failed normalizer must not look like an empty but passing reference. This
 * fixture uses an unsupported version beside a valid claim host so the observed
 * error can only come from loading and upgrading the configured source.
 *
 * 1. Configure one local Swagger source whose version is unsupported.
 * 2. Run the linked project rule through `ttsc check`.
 * 3. Assert the direct failure remains without empty-population derivatives.
 */
export const test_evidence_graph_reports_swagger_source_failures = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "swagger-invalid",
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
      '        reference: { type: "swagger", file: "api/openapi.json" },',
      "      }],",
      "    }],",
      "  },",
      "};",
      "",
    ].join("\n"),
    files: {
      "api/openapi.json": JSON.stringify({
        openapi: "4.0.0",
        info: { title: "Invalid", version: "1.0.0" },
        paths: {},
      }),
      "src/ref.ts": "export interface Ref {}\n",
    },
  });
  try {
    const result = runCheck(project.directory);
    assertFailure(
      result,
      "An unsupported OpenAPI document must fail the evidence graph.",
    );
    assertIncludes(
      result,
      "api/openapi.json",
      "The normalizer diagnostic must identify the broken source.",
    );
    assertIncludes(
      result,
      "@typia/interface OpenApi.IDocument",
      "The diagnostic must name the normalization contract that rejected the source.",
    );
    assertExcludes(
      result,
      "materialized no selected evidence units",
      "A rejected source is incomplete, not a healthy empty operation set.",
    );
    assertExcludes(
      result,
      "Missing acknowledgement",
      "Coverage cannot be derived while the reference loader is unhealthy.",
    );
  } finally {
    project.cleanup();
  }
};
