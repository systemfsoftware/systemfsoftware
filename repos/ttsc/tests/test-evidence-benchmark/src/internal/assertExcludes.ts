import type { IRunResult } from "./IRunResult";

/**
 * Fails when a workspace command printed something a case requires to be
 * absent.
 *
 * The negative twin of {@link assertIncludes}. An absence is what distinguishes
 * a claim that stayed correctly quiet from one that never loaded, so the
 * failure message shows the whole output rather than only the forbidden text.
 */
export const assertExcludes = (
  result: IRunResult,
  forbidden: string,
  because: string,
): void => {
  if (!result.output.includes(forbidden)) return;
  throw new Error(
    `${because}\n\nCommand: pnpm run ${result.script}\nDirectory: ${result.cwd}\n\nExpected output NOT to include:\n  ${forbidden}\n\nActual output:\n${result.output}`,
  );
};
