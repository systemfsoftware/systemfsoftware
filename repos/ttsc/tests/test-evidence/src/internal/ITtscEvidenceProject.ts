/**
 * A materialized fixture project and the handle that disposes it.
 *
 * The directory is a real temporary project with its own `node_modules`, so a
 * case that forgets to clean up leaves a linked copy of the workspace behind.
 * Every case therefore disposes it in a `finally`.
 */
export interface ITtscEvidenceProject {
  /** Absolute path of the throwaway project root. */
  readonly directory: string;

  /**
   * Absolute path of the directory the project sits inside.
   *
   * This is what a population's `root` can ascend into, and what a case writes
   * a shared document set to. Disposing the fixture disposes it too.
   */
  readonly workspace: string;

  /**
   * Removes the fixture, tolerating a directory the OS has not released yet.
   *
   * Safe to call more than once, and safe to call after a failed run.
   */
  cleanup(): void;
}
