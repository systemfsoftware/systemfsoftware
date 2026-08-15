import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertFailure,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies confinement holds on the two paths a shipped configuration uses and
 * the TypeScript fixtures never reach: a Prisma ledger, and a carrier resolved
 * against a claim root rather than the project root.
 *
 * A Prisma exclusion is not a declaration on a selected host. It is an
 * unattached top-level `///` run that Prisma generation never sees, parsed by a
 * separate path from the one every TypeScript fixture exercises, so confinement
 * proved on exported symbols proves nothing about it.
 *
 * A rooted carrier is the second. `root` moves the population's base, and a
 * carrier pattern resolved against the project root instead would match nothing
 * and reject every exclusion the ledger legitimately holds. Both shapes ship in
 * this repository's own benchmark template, where getting either wrong fails
 * the workspace before a cell writes anything.
 *
 * The two runs share one configuration and one pair of schema sources. Only the
 * file holding the exclusion moves, so a difference in outcome is attributable
 * to placement and to nothing else.
 *
 * 1. Root a Prisma claim above the project and confine it to `exclude.schema`.
 * 2. Assert the ledger's own exclusion discharges its target and the build passes.
 * 3. Move that exclusion onto the model's own documentation comment.
 * 4. Assert it is reported as misplaced, named against the rooted carrier, and
 *    grants no coverage.
 */
export const test_evidence_graph_confines_prisma_and_rooted_carriers =
  (): void => {
    const lintConfig: string = [
      'import type { ITtscLintConfig } from "@ttsc/lint";',
      'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
      "",
      "const graph: ITtscEvidenceGraphConfig = {",
      "  claims: [",
      "    {",
      '      name: "models",',
      '      type: "prisma",',
      '      root: "..",',
      '      files: ["schema/**/*.prisma", "schema/exclude.schema"],',
      '      evidenceExcludeCarriers: ["schema/exclude.schema"],',
      '      symbol: "model",',
      "      reference: {",
      '        type: "markdown",',
      '        root: "..",',
      '        files: ["docs/spec.md"],',
      '        symbol: "h2",',
      "      },",
      "    },",
      "  ],",
      "};",
      "",
      "export default {",
      "  plugins: { evidence },",
      '  rules: { "evidence/graph": ["error", graph] },',
      "} satisfies ITtscLintConfig;",
      "",
    ].join("\n");

    const spec: string = "## Stored {#stored}\n\n## Deferred {#deferred}\n";
    const reason: string =
      "The frontend owns this presentation-only section; reject this exclusion if it gains persisted state.";
    const model: string[] = [
      "/// A persisted sale.",
      "///",
      "/// @evidence docs/spec.md#stored Stores the required sale.",
      "model sales {",
      "  id String @id",
      "}",
      "",
    ];
    // The claim selects a Prisma population above the project, so the project
    // itself only needs one source for ttsc to compile.
    const files: Record<string, string> = {
      "src/placeholder.ts": "export const placeholder = true;\n",
    };

    // The exclusion sits in the lint-only ledger, which is where the claim says
    // exclusions live.
    const confined: ITtscEvidenceProject = createProject({
      name: "prisma-carrier-confined",
      lintConfig,
      files,
      workspaceFiles: {
        "docs/spec.md": spec,
        "schema/main.prisma": model.join("\n"),
        "schema/exclude.schema": [
          "/// Lint-only carrier for schema exclusions.",
          "///",
          `/// @evidenceExclude docs/spec.md#deferred ${reason}`,
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(confined.directory);
      assertStatus(
        result,
        0,
        "A Prisma exclusion inside its declared carrier must remain eligible.",
      );
      assertExcludes(
        result,
        "Missing acknowledgement",
        "A confined Prisma exclusion must still discharge the section it names.",
      );
      assertExcludes(
        result,
        "Misplaced @evidenceExclude",
        "A rooted carrier holding its own exclusion must draw no placement repair.",
      );
    } finally {
      confined.cleanup();
    }

    // The same exclusion, moved onto the model the claim selects. The host is
    // legal for this claim; the file is not the declared carrier.
    const misplaced: ITtscEvidenceProject = createProject({
      name: "prisma-carrier-misplaced",
      lintConfig,
      files,
      workspaceFiles: {
        "docs/spec.md": spec,
        "schema/main.prisma": [
          ...model.slice(0, 3),
          `/// @evidenceExclude docs/spec.md#deferred ${reason}`,
          ...model.slice(3),
        ].join("\n"),
        "schema/exclude.schema":
          "/// Lint-only carrier for schema exclusions.\n",
      },
    });
    try {
      const result = runCheck(misplaced.directory);
      assertFailure(
        result,
        "A Prisma exclusion outside its declared carrier must fail the build.",
      );
      assertIncludes(
        result,
        "Misplaced @evidenceExclude",
        "The finding must read as a placement error, not a resolution failure.",
      );
      assertIncludes(
        result,
        "'schema/exclude.schema'",
        "The repair must name the carrier as the claim's own root spells it.",
      );
      assertIncludes(
        result,
        "Missing acknowledgement",
        "A refused Prisma exclusion must grant no coverage, leaving its target owed.",
      );
    } finally {
      misplaced.cleanup();
    }
  };
