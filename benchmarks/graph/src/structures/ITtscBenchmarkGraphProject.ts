/** Describes one prepared repository in the graph benchmark corpus. */
export interface ITtscBenchmarkGraphProject {
  /** Plain project name visible in the fixture checkout directory. */
  repoName: string;

  /** Git repository cloned to prepare the fixture. */
  sourceRepo: string;

  /** Fixture branch whose program includes source and tests. */
  sourceBranch: "graph";

  /** Project-relative tsconfig used to build the compiler graph. */
  tsconfig: string;
}
