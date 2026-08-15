/** Workspace package tarball installed into prepared fixtures. */
export interface ITtscBenchmarkPerformanceTarball {
  /** Workspace package directory passed to pnpm pack. */
  dir: string;

  /** Deterministic archive filename in the tarball staging directory. */
  file: string;

  /** Package name rewritten into fixture dependency maps. */
  name: string;
}
