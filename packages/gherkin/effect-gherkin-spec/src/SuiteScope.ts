import { Effect } from 'effect'

type AnyValue<A = unknown> = A

export type ScopeMap = Readonly<Record<string, Effect.Effect<AnyValue, never, never>>>

export type ScopeServices<S extends ScopeMap> = {
  readonly [K in keyof S]: S[K] extends Effect.Effect<infer A, never, infer _R> ? A : never
}

export type ScopeIdentifiers<S extends ScopeMap> = {
  [K in keyof S]: S[K] extends Effect.Effect<infer _A, never, infer R> ? R : never
}[keyof S]

/**
 * Resolves every service named by the scope map at once, preserving the
 * record's shape and the union of the named requirements.
 */
export function resolve<S extends ScopeMap>(map: S): Effect.Effect<ScopeServices<S>, never, ScopeIdentifiers<S>>
export function resolve(map: ScopeMap): Effect.Effect<Record<string, AnyValue>, never, never> {
  return Effect.all(map)
}
