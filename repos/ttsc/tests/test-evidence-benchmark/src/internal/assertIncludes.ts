import type { IRunResult } from "./IRunResult";

/** Fails with a message that shows what the workspace command actually said. */
export const assertIncludes = (
  result: IRunResult,
  expected: string,
  because: string,
): void => {
  if (result.output.includes(expected)) return;
  throw new Error(
    `${because}\n\nCommand: pnpm run ${result.script}\nDirectory: ${result.cwd}\n\nExpected output to include:\n  ${expected}\n\nActual output:\n${result.output}`,
  );
};
