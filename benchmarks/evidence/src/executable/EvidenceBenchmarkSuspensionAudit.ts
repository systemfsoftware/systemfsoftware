import path from "node:path";

import { EvidenceBenchmarkLayout } from "../EvidenceBenchmarkLayout";
import { auditWindowsEvidenceBenchmarkSuspensions } from "../EvidenceBenchmarkSuspensionAudit";
import type { ITtscEvidenceBenchmarkSuspensionAuditResult } from "../EvidenceBenchmarkSuspensionAudit";

const repository: string = EvidenceBenchmarkLayout.repositoryRoot;
const args: string[] = process.argv.slice(2);
const runIds: string[] = [];
for (let index: number = 0; index < args.length; ++index) {
  if (args[index] !== "--run-id")
    throw new Error(`Unexpected suspension-audit argument: ${args[index]}.`);
  const runId: string | undefined = args[++index];
  if (runId === undefined) throw new Error("Missing value after --run-id.");
  runIds.push(runId);
}

const result: ITtscEvidenceBenchmarkSuspensionAuditResult =
  auditWindowsEvidenceBenchmarkSuspensions(
    repository,
    runIds.length === 0 ? undefined : runIds,
  );
process.stdout.write(
  `Audited ${result.runs} benchmark runs across ${result.intervals} disconnected intervals; added ${result.added} corrections.\n`,
);
