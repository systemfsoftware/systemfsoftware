import type { Effect, Scope } from 'effect'
import type { Sharding } from 'effect/unstable/cluster'

const SingletonTag = { _tag: 'Singleton' } as const
type SingletonTag = typeof SingletonTag

const EntityTag = { _tag: 'Entity' } as const
type EntityTag = typeof EntityTag

export interface SingletonChild<R = never> extends SingletonTag {
  readonly name: string
  readonly run: (ready: Effect.Effect<void>) => Effect.Effect<void, never, R>
}

export interface EntityChild<R = never> extends EntityTag {
  readonly entityId: string
  readonly register: Effect.Effect<void, never, Scope.Scope | Sharding.Sharding | R>
  readonly probe: Effect.Effect<boolean, never, Sharding.Sharding | R>
}

export type ClusterProgramRequirements = Scope.Scope | Sharding.Sharding

export type ClusterProgram<R = ClusterProgramRequirements> = SingletonChild<R> | EntityChild<R>

export interface SingletonChildOptions<R = never> {
  readonly name: string
  readonly run: (ready: Effect.Effect<void>) => Effect.Effect<void, never, R>
}

export interface EntityChildOptions<R = never> {
  readonly entityId: string
  readonly register: Effect.Effect<void, never, Scope.Scope | Sharding.Sharding | R>
  readonly probe: Effect.Effect<boolean, never, Sharding.Sharding | R>
}

export const singletonChild = <R = never>(options: SingletonChildOptions<R>): SingletonChild<R> => ({
  ...SingletonTag,
  ...options,
})

export const entityChild = <R = never>(options: EntityChildOptions<R>): EntityChild<R> => ({
  ...EntityTag,
  ...options,
})
