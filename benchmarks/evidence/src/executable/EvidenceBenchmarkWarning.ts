import path from "node:path";

import { EvidenceBenchmarkLayout } from "../EvidenceBenchmarkLayout";
import { EvidenceBenchmarkSupervision } from "../EvidenceBenchmarkSupervision";

const main = (): void => {
  const [subject, arm, runId, warningFile] = process.argv.slice(2);
  if (
    subject === undefined ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subject) ||
    (arm !== "evidence" && arm !== "plain") ||
    runId === undefined ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    ) ||
    warningFile === undefined ||
    process.argv.length !== 6
  )
    throw new Error(
      "Usage: pnpm warn <subject> <evidence|plain> <run-id> <warning.json>",
    );
  const repository: string = EvidenceBenchmarkLayout.repositoryRoot;
  const verdict = EvidenceBenchmarkSupervision.warn({
    runRoot: path.join(
      EvidenceBenchmarkLayout.assetsRoot(repository),
      "output",
      subject,
      "codex",
      arm,
      "runs",
      runId,
    ),
    instructionsRoot: path.join(
      EvidenceBenchmarkLayout.assetsRoot(repository),
      "instructions",
    ),
    warningFile,
    subject,
  });
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
};

main();
