import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkLayout } from "../EvidenceBenchmarkLayout";
import { EvidenceBenchmarkReconcile } from "../EvidenceBenchmarkReconcile";

/**
 * Reconciles one cell the runner can no longer resume.
 *
 * Stages are named in objective order. A stage the direct drive touched carries
 * its console after an `=`; a stage only the runner drove carries the name
 * alone. Both sources are read, never assumed.
 */
const main = async (): Promise<void> => {
  const [subject, arm, runId, rollout, ...stages] = process.argv.slice(2);
  if (
    subject === undefined ||
    (arm !== "evidence" && arm !== "plain") ||
    runId === undefined ||
    rollout === undefined ||
    stages.length === 0
  )
    throw new Error(
      "Usage: pnpm reconcile <subject> <evidence|plain> <run-id> <rollout.jsonl> <stage[=console.log]>...",
    );
  if (!fs.existsSync(rollout))
    throw new Error(`Codex session rollout not found: ${rollout}.`);

  const repository: string = EvidenceBenchmarkLayout.repositoryRoot;
  const runRoot: string = path.join(
    EvidenceBenchmarkLayout.assetsRoot(repository),
    "output",
    subject,
    "codex",
    arm,
    "runs",
    runId,
  );
  if (!fs.existsSync(path.join(runRoot, "state.json")))
    throw new Error(`Benchmark run not found: ${runRoot}.`);

  const written = await EvidenceBenchmarkReconcile.run({
    runRoot,
    rollout,
    stages: stages.map((entry, index) => {
      const [name, log] = entry.split("=");
      return {
        index,
        name: name!,
        ...(log === undefined ? {} : { console: log }),
      };
    }),
  });
  for (const stage of written)
    console.log(
      `  ${stage.index} ${stage.name.padEnd(17)} ${stage.tokens.toLocaleString().padStart(12)}  ${Math.round(stage.elapsedMs / 60000)}m (runner ${Math.round(stage.runnerMs / 60000)}m + direct ${Math.round(stage.directMs / 60000)}m)`,
    );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
