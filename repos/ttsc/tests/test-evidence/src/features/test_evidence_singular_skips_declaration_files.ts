import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies declaration files are not visited by the singular rule.
 *
 * The opt-out is a marker method the host reads, so the Go cases cannot prove
 * it: they call `Check` directly and would report a `.d.ts` like any other
 * file. Only a real run shows whether the host honors the declaration, and the
 * marker defaults to visiting when unimplemented — so a silent regression here
 * would start reporting every ambient bundle a project depends on.
 *
 * 1. Ship a `.d.ts` that declares two identities and matches no file name.
 * 2. Enable `evidence/singular` over a project that includes it.
 * 3. Assert a clean exit while the same violation in a `.ts` file would fail.
 */
export const test_evidence_singular_skips_declaration_files = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "singular-declarations",
    include: ["src"],
    lintConfig: [
      'import { evidence } from "@ttsc/evidence";',
      "",
      "export default {",
      '  plugins: { "evidence": evidence },',
      "  rules: {",
      '    "evidence/singular": "error",',
      "  },",
      "};",
      "",
    ].join("\n"),
    files: {
      "src/ambient.d.ts": [
        "export interface IAlpha {",
        "  id: string;",
        "}",
        "export interface IBeta {",
        "  id: string;",
        "}",
        "",
      ].join("\n"),
      "src/handler.ts": ["export const handler = (): void => {};", ""].join(
        "\n",
      ),
    },
  });
  try {
    const result = runCheck(project.directory);
    assertStatus(
      result,
      0,
      "A declaration file must not be visited by evidence/singular.",
    );
    assertExcludes(
      result,
      "evidence/singular",
      "No finding may come from a declaration file.",
    );
  } finally {
    project.cleanup();
  }
};
