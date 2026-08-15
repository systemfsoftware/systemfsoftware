import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertFailure,
  assertIncludes,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies a misconfigured `evidence/documented` names itself once through the
 * real binary.
 *
 * The Go cases pin the message text; this pins what a consumer actually reads,
 * which is the only place the misattribution ever mattered. The project spans
 * several files while a valid graph rule publishes the current Program cycle,
 * so the file rule can report one configuration defect instead of repeating it
 * for every source.
 *
 * 1. Enable both rules, misspelling one `evidence/documented` option key.
 * 2. Run `ttsc check` over several TypeScript files.
 * 3. Assert one failure names `evidence/documented` and never the graph.
 */
export const test_evidence_documented_configuration_names_its_own_rule =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "documented-config-owner",
      include: ["src"],
      lintConfig: [
        'import { evidence } from "@ttsc/evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", { claims: [{',
        '      type: "typescript",',
        '      files: ["src/claim.ts"],',
        '      symbol: "type",',
        '      reference: { type: "markdown", files: ["docs/spec.md"], symbol: "h2" },',
        "    }] }],",
        '    "evidence/documented": ["error", { symbols: "type" }],',
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "docs/spec.md": "## Contract\n",
        "src/claim.ts": [
          "/**",
          " * Claim.",
          " * @evidence docs/spec.md#contract Implements this contract.",
          " */",
          "export interface Claim {}",
          "",
        ].join("\n"),
        "src/alpha.ts": ["/** Alpha. */", "export const alpha = 1;", ""].join(
          "\n",
        ),
        "src/beta.ts": ["/** Beta. */", "export const beta = 2;", ""].join(
          "\n",
        ),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertFailure(
        result,
        "A misspelled option key must fail the build rather than fall back to a default selection.",
      );
      assertIncludes(
        result,
        "Invalid evidence/documented configuration",
        "The diagnostic must name the rule whose setting is actually wrong.",
      );
      const occurrences: number =
        result.output.split("Invalid evidence/documented configuration")
          .length - 1;
      if (occurrences !== 1)
        throw new Error(
          `The configuration failure must appear once per Program cycle, got ${occurrences}.\n\nActual output:\n${result.output}`,
        );
      assertExcludes(
        result,
        "Invalid evidence/graph configuration",
        "A documented misconfiguration must never send the reader to the graph's settings.",
      );
    } finally {
      project.cleanup();
    }
  };
