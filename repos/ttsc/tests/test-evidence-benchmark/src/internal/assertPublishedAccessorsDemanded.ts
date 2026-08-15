import path from "node:path";

import type { IBenchmarkWorkspace } from "./IBenchmarkWorkspace";
import type { IMissingAcknowledgement } from "./evidenceDiagnostics";
import { sdkAccessorAddresses } from "./sdkAccessorAddresses";

/**
 * Asserts a claim reaching the installed SDK owes every accessor it publishes.
 *
 * This is the assertion the voided cohort needed and did not have. A `package`
 * reference selects the generated accessor surface out of an install, and a
 * workspace dependency is a link — pnpm writes a junction on Windows.
 * Enumerating that link with a walker that treats it as a plain entry returns
 * nothing, and a reference that selects nothing demands nothing, so the claim
 * reports full coverage of operations no one implemented.
 *
 * Asserting at the claim level is not enough to catch it, which is why this
 * exists separately. These claims carry a Markdown reference as well, and that
 * one stays healthy; a claim whose package reference has gone empty still
 * reports its requirement obligations and still looks active. Only naming the
 * accessors distinguishes them.
 *
 * The expectation comes from the `@accessor` tags the generator writes, so it
 * follows the controllers rather than a list kept in this suite.
 */
export const assertPublishedAccessorsDemanded = (props: {
  readonly workspace: IBenchmarkWorkspace;
  readonly claim: string;
  readonly obligations: readonly IMissingAcknowledgement[];
}): void => {
  const published: string[] = sdkAccessorAddresses(
    path.join(
      props.workspace.workspace,
      "packages",
      "api",
      "src",
      "functional",
    ),
  );
  const demanded = new Set<string>(
    props.obligations.map((obligation) => obligation.target),
  );
  const missing: string[] = published.filter(
    (address) => !demanded.has(address),
  );
  if (missing.length === 0) return;
  throw new Error(
    `Claim '${props.claim}' reaches the generated SDK through the installed package, but nothing was owed for ${missing.join(", ")} of the ${String(published.length)} published accessor(s).\n\nPublished by the SDK:\n  ${published.join("\n  ")}\n\nDemanded by this claim:\n  ${[...demanded].join("\n  ") || "(nothing)"}\n\nA package reference that enumerates a workspace link as a plain entry returns an empty population, and an empty population reports full coverage while checking nothing.`,
  );
};
