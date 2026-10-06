import { Effect, Option } from 'effect'
import type * as Scope from 'effect/Scope'

/** The CI run id and the wall clock the run prefix is minted from. */
export interface RunPrefixOf {
  readonly githubRunId: Option.Option<string>
  readonly epochMillis: number
}

/**
 * The prefix every resource the run creates is named with: `kiro-ci-<run id>-`
 * in CI, `local-<epoch>-` otherwise. A leftover carrying it is the run's leak.
 */
export const runPrefix = ({ githubRunId, epochMillis }: RunPrefixOf): string =>
  Option.match(githubRunId, {
    onNone: () => `local-${Math.floor(epochMillis)}-`,
    onSome: (runId) => `kiro-ci-${runId}-`,
  })

/** A resource's create effect and the destroy that releases it. */
export interface ResourceLifecycle<Handle, E, R> {
  readonly create: Effect.Effect<Handle, E, R>
  readonly destroy: (handle: Handle) => Effect.Effect<void>
}

/**
 * Run `create` now and `destroy` from the surrounding scope's finalizer, so a
 * created resource is released however the run ends. The name `create` mints is
 * the caller's to prefix with the run.
 */
export const withCreatedResource = <Handle, E, R>(
  { create, destroy }: ResourceLifecycle<Handle, E, R>,
): Effect.Effect<Handle, E, R | Scope.Scope> => Effect.acquireRelease(create, (handle) => destroy(handle))
