import type { IRunResult } from "./IRunResult";

/** Fails when a real workspace command exits with an unexpected status. */
export const assertStatus = (
  result: IRunResult,
  expected: number,
  because: string,
): void => {
  if (result.status === expected) return;
  throw new Error(
    `${because}\n\nCommand: pnpm run ${result.script}\nDirectory: ${result.cwd}\nExpected exit status: ${expected}\nActual exit status: ${String(result.status)}\n\nActual output:\n${result.output}`,
  );
};
