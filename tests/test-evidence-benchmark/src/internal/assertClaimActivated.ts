import type { IRunResult } from "./IRunResult";
import {
  type IMissingAcknowledgement,
  readEmptyPopulationReports,
  readMissingAcknowledgements,
} from "./evidenceDiagnostics";

/**
 * Asserts that removing one claim's activation marker actually turned it on.
 *
 * Activation is the property this suite exists to hold, and it has two halves
 * that fail in opposite directions.
 *
 * The first is that no population came back empty. A claim or reference that
 * matched no files says so, and that diagnostic names an obligation which
 * materialized nothing — the state a pnpm workspace link produced when it was
 * walked as a plain entry.
 *
 * The second is that the claim demanded something. This is the half a clean
 * exit cannot distinguish: a claim whose reference selects zero units reports
 * full coverage, so silence from an enabled claim over a workspace that has
 * satisfied none of its obligations is the defect rather than the pass. Every
 * layer this suite materializes is deliberately untagged, so there is always
 * something to owe.
 *
 * @returns The obligations this claim reported, for a case that narrows
 *   further.
 */
export const assertClaimActivated = (props: {
  readonly result: IRunResult;
  readonly claim: string;
}): IMissingAcknowledgement[] => {
  const empty: string[] = readEmptyPopulationReports(props.result).filter(
    (line) => line.includes(`'${props.claim}'`),
  );
  if (empty.length !== 0)
    throw new Error(
      `Claim '${props.claim}' selected an empty population, so it owes nothing and would pass while checking nothing.\n\nCommand: pnpm run ${props.result.script}\nDirectory: ${props.result.cwd}\n\n${empty.join("\n")}\n\nFull output:\n${props.result.output}`,
    );
  const obligations: IMissingAcknowledgement[] = readMissingAcknowledgements(
    props.result,
  ).filter((obligation) => obligation.claim === props.claim);
  if (obligations.length === 0)
    throw new Error(
      `Claim '${props.claim}' reported no obligation after its activation marker was removed. Its host layer exists and none of its evidence is cited, so an active claim owes something here; silence means the claim never activated or its references selected nothing.\n\nCommand: pnpm run ${props.result.script}\nDirectory: ${props.result.cwd}\n\nFull output:\n${props.result.output}`,
    );
  return obligations;
};
