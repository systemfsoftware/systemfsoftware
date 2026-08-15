import fs from "node:fs";
import path from "node:path";

import {
  FIRST_BUILD_TIMEOUT,
  type ITtscEvidenceProject,
  type IWatchSession,
  assertExcludes,
  assertFailure,
  assertIncludes,
  assertStatus,
  createProject,
  startWatch,
} from "../internal/index";

/**
 * Verifies a typed consumer can disable and later enable one claim through the
 * real contributor binary.
 *
 * Native unit tests can prove filtering, but only the consumer path proves the
 * public property reaches the compiled Go options without a descriptor or JSON
 * name mismatch. An enabled sibling stays present so a quiet first check cannot
 * be mistaken for the graph rule failing to load.
 *
 * 1. Disable an incomplete claim beside one satisfied enabled claim.
 * 2. Assert the real check passes without loading the staged reference.
 * 3. Enable the same claim and assert its missing population fails the check.
 */
export const test_evidence_graph_disables_a_staged_claim =
  async (): Promise<void> => {
    const lintConfig = (disabled: boolean): string =>
      [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence, type ITtscEvidenceGraphConfig } from "@ttsc/evidence";',
        "",
        "const graph: ITtscEvidenceGraphConfig = {",
        "  claims: [",
        "    {",
        '      type: "typescript",',
        '      name: "Staged",',
        `      disabled: ${disabled},`,
        '      files: ["src/staged.ts"],',
        '      symbol: "type",',
        '      reference: { type: "markdown", files: ["missing-docs/**/*.md"], symbol: "h2" },',
        "    },",
        "    {",
        '      type: "typescript",',
        '      name: "Live",',
        '      files: ["src/live.ts"],',
        '      symbol: "type",',
        '      reference: { type: "markdown", files: ["docs/live.md"], symbol: "h2" },',
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

    const project: ITtscEvidenceProject = createProject({
      name: "disabled-staged-claim",
      include: ["src"],
      lintConfig: lintConfig(true),
      files: {
        "docs/live.md": "## Live Requirement {#live}\n",
        "src/live.ts": [
          "/** @evidence docs/live.md#live Implements the live requirement. */",
          "export interface ILive {}",
          "",
        ].join("\n"),
        "src/staged.ts": "export interface IStaged {}\n",
      },
    });
    const session: IWatchSession = startWatch(project.directory);
    try {
      const staged = await session.nextBuild(FIRST_BUILD_TIMEOUT);
      assertStatus(staged, 0, "A disabled claim must not load or evaluate.");
      assertExcludes(
        staged,
        "missing-docs",
        "The disabled population must remain outside graph loading.",
      );

      fs.writeFileSync(
        path.join(project.directory, "lint.config.ts"),
        lintConfig(false),
        "utf8",
      );
      const enabled = await session.nextBuild();
      assertFailure(enabled, "Re-enabling the incomplete claim must fail.");
      assertIncludes(
        enabled,
        "Claim 1 ('Staged')",
        "The restored diagnostic must retain the claim's original identity.",
      );
      assertIncludes(
        enabled,
        "missing-docs",
        "Re-enabling must restore ordinary population loading.",
      );
    } finally {
      await session.close();
      project.cleanup();
    }
  };
