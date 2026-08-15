import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the packaged graph judges a merged identity, not the declaration
 * carrying the tag.
 *
 * Two properties are asserted together because they are the same promise seen
 * from each side: a citation written on either half resolves and discharges the
 * obligation, and any diagnostic naming that identity names its first
 * declaration. The Go cases read the inventory directly, so only a real run
 * shows a consumer both halves of it — including that no diagnostic complains
 * about where the tag was written.
 *
 * 1. Cite one section from the second half of a merged identity, leaving a second
 *    section unacknowledged.
 * 2. Run a graph obligating both sections.
 * 3. Assert the citation counted, and that the remaining obligation points at the
 *    identity's first declaration.
 */
export const test_evidence_graph_resolves_merged_identity_from_first_declaration =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "citation-position",
      include: ["src"],
      lintConfig: [
        'import { evidence } from "@ttsc/evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", {',
        "      claims: [{",
        '        type: "typescript",',
        '        files: ["src/ledger.ts"],',
        '        symbol: "type",',
        "        reference: {",
        '          type: "typescript",',
        '          files: ["src/ISale.ts"],',
        '          symbol: "type",',
        "        },",
        "      }, {",
        '        type: "typescript",',
        '        files: ["src/**"],',
        '        symbol: "type",',
        "        reference: {",
        '          type: "markdown",',
        '          files: ["docs/spec.md"],',
        '          symbol: "h2",',
        "        },",
        "      }],",
        "    }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "docs/spec.md": "## Sale Price {#sale-price}\n",
        "src/ledger.ts": "export interface ILedger {}\n",
        "src/ISale.ts": [
          "export interface ISale {",
          "  price: number;",
          "}",
          "/** @evidence docs/spec.md#sale-price The contract mirrors this pricing rule. */",
          "export namespace ISale {",
          "  export interface ICreate {",
          "    price: number;",
          "  }",
          "}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertIncludes(
        result,
        "Missing acknowledgement for 'ISale' (TypeScript type 'ISale' at src/ISale.ts:1)",
        "An obligation must point at the identity's first declaration, whichever half carries a tag.",
      );
      assertExcludes(
        result,
        "docs/spec.md#sale-price",
        "A citation on the later declaration must still discharge its obligation.",
      );
      assertStatus(
        result,
        2,
        "Only the unacknowledged obligation may fail the build; the tag's position is not an error.",
      );
    } finally {
      project.cleanup();
    }
  };
