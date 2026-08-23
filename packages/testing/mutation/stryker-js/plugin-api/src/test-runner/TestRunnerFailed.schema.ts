import * as S from 'effect/Schema'

/**
 * The failure a `TestRunner` port carries on its error channel.
 *
 * This is narrower than it looks, and deliberately so. A test run that finishes
 * with failing tests, a timeout, or a mutant-killing error is **not** a failure
 * of this port — those are outcomes, and they travel as `DryRunResult` /
 * `MutantRunResult` on the success channel where the caller must handle every
 * variant. This error is for the runner itself breaking: the environment could
 * not be created, the framework could not be loaded, the worker died.
 *
 * Collapsing the two would lose the distinction the mutation score is built on,
 * because a runner that cannot start looks exactly like a mutant that survived.
 */
export class TestRunnerFailed extends S.TaggedError<TestRunnerFailed>()('TestRunnerFailed', {
  runnerName: S.String,
  phase: S.Literals(['capabilities', 'init', 'dryRun', 'mutantRun', 'dispose']),
  cause: S.Unknown,
}) {}
