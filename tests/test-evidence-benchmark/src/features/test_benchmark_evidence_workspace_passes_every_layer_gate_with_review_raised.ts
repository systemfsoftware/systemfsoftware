import fs from "node:fs";
import path from "node:path";

import type { IBenchmarkWorkspace } from "../internal/IBenchmarkWorkspace";
import type { IRunResult } from "../internal/IRunResult";
import { assertExcludes } from "../internal/assertExcludes";
import { assertStatus } from "../internal/assertStatus";
import { acquireBenchmarkWorkspace } from "../internal/benchmarkWorkspace";
import { provisionEnvironment } from "../internal/provisionEnvironment";
import { runScript } from "../internal/runScript";

/**
 * The three claim configurations that ship `evidence/review` staged shut.
 *
 * Each layer's Review raises its own, so the set is the union of what the arm's
 * `review/backend.md` and `review/frontend.md` prescribe. Reading the files and
 * rewriting the staged severity is what a cell does; the case does it in one
 * step to reach the state every later objective runs in.
 */
const CONFIGURATIONS: readonly string[] = [
  "packages/api/lint.config.ts",
  "packages/backend/test/lint.config.ts",
  "packages/frontend/lint.config.ts",
];

const STAGED = `"evidence/review": "off"`;
const RAISED = `"evidence/review": "error"`;

/**
 * Verifies the delivered Evidence workspace still passes every layer gate once
 * `evidence/review` is raised to `error`.
 *
 * The sibling case covers the workspace as handed over, where the rule is
 * staged shut. That leaves the state the arm actually spends most of its run in
 * untested: each layer's Review raises the rule and every objective after it
 * builds with the rule on. Two failures live there and neither is visible with
 * the rule off. A configuration whose raised severity does not type-check fails
 * `build:main`, `build:sdk`, `build:test`, and `lint` alike, because `ttsc`
 * evaluates `lint.config.ts` in a Program of its own. And a scaffold that
 * reported an unreviewed acknowledgement here would be reporting one for a tag
 * no cell has written yet, since every claim still carries `disabled` — an
 * obligation the instruction told the cell not to answer.
 *
 * 1. Materialize the Evidence arm through the runner's own preparation path.
 * 2. Raise the staged severity in all three claim configurations.
 * 3. Run every layer gate a cell runs and require a zero exit from each.
 * 4. Assert no review obligation was reported.
 */
export const test_benchmark_evidence_workspace_passes_every_layer_gate_with_review_raised =
  async (): Promise<void> => {
    const workspace: IBenchmarkWorkspace =
      await acquireBenchmarkWorkspace("evidence");
    for (const relative of CONFIGURATIONS) {
      const location: string = path.join(
        workspace.workspace,
        ...relative.split("/"),
      );
      const source: string = fs.readFileSync(location, "utf8");
      if (!source.includes(STAGED))
        throw new Error(
          `${relative} must ship \`${STAGED}\` for a layer's Review to raise. Without the staged severity the arm has no review obligation to turn on, and this case would assert against a workspace no cell is handed.`,
        );
      fs.writeFileSync(location, source.replace(STAGED, RAISED));
    }

    provisionEnvironment(workspace.workspace);
    const backend: string = path.join(
      workspace.workspace,
      "packages",
      "backend",
    );
    const gates: readonly string[] = [
      "build:prisma",
      "schema",
      "build:main",
      "build:sdk",
      "build:test",
      "lint",
      "test",
    ];
    for (const script of gates) {
      const result: IRunResult = runScript({ cwd: backend, script });
      assertStatus(
        result,
        0,
        `The Evidence backend must pass \`pnpm ${script}\` with \`evidence/review\` raised to \`error\`. Every objective after a layer's Review builds in this state, so a gate that fails here fails the rest of the arm.`,
      );
      assertReviewSilent(result, script);
    }

    for (const owner of ["api", "frontend"]) {
      const result: IRunResult = runScript({
        cwd: path.join(workspace.workspace, "packages", owner),
        script: "lint",
      });
      assertStatus(
        result,
        0,
        `The Evidence \`packages/${owner}\` package must lint clean with \`evidence/review\` raised to \`error\`.`,
      );
      assertReviewSilent(result, "lint");
    }
  };

/**
 * Fails when a gate reported a review obligation on the delivered scaffold.
 *
 * `Unreviewed @` opens every diagnostic the rule raises, and an acknowledgement
 * cannot be unreviewed before one exists. A hit therefore means the raised rule
 * reaches something the staged claims were supposed to be holding shut, which
 * would fill a cell's context with errors for tags it has not been told to
 * write.
 */
const assertReviewSilent = (result: IRunResult, script: string): void =>
  assertExcludes(
    result,
    "Unreviewed @",
    `\`pnpm ${script}\` reported a review obligation while every claim still carries its \`disabled\` marker. A staged claim owes no acknowledgement, so it can owe no review either.`,
  );
