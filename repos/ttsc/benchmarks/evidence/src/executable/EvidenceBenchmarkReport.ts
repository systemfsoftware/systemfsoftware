import path from "node:path";

import { EvidenceBenchmarkLayout } from "../EvidenceBenchmarkLayout";
import { writeEvidenceBenchmarkReport } from "../EvidenceBenchmarkReport";
import type { ITtscEvidenceBenchmarkReport } from "../structures/ITtscEvidenceBenchmarkReport";

const repository: string = EvidenceBenchmarkLayout.repositoryRoot;
const args: string[] = process.argv.slice(2);
let output: string = path.join(
  EvidenceBenchmarkLayout.assetsRoot(repository),
  "aggregate",
);
const runIds: string[] = [];
let outputAssigned: boolean = false;
for (let i: number = 0; i < args.length; ++i) {
  const argument: string = args[i]!;
  if (argument === "--run-id") {
    const runId: string | undefined = args[++i];
    if (runId === undefined) throw new Error("Missing value after --run-id.");
    runIds.push(runId);
  } else if (outputAssigned === false) {
    output = path.resolve(process.cwd(), argument);
    outputAssigned = true;
  } else throw new Error(`Unexpected benchmark report argument: ${argument}.`);
}

const report: ITtscEvidenceBenchmarkReport = writeEvidenceBenchmarkReport({
  repository,
  output,
  ...(runIds.length === 0 ? {} : { runIds }),
});
process.stdout.write(
  `Wrote ${report.cells.length} benchmark cells to ${output}.\n`,
);
