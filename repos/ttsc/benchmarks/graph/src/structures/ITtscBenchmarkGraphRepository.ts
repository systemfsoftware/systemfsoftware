/** Describes a source repository and its prepared graph fixture checkout. */
export interface ITtscBenchmarkGraphRepository {
  /** Upstream source repository URL used for project metadata. */
  url: string;

  /** Fixture repository URL cloned for benchmark execution. */
  fixtureUrl: string;

  /** Default fixture branch; explicit direct-harness overrides may replace it. */
  fixtureBranch?: string;

  /** Project-relative tsconfig that defines the indexed program. */
  tsconfig: string;
}
