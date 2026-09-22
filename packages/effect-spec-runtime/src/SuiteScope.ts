import { Effect } from 'effect'

type AnyValue<A = unknown> = A

export type ScopeMap = Readonly<Record<string, Effect.Effect<AnyValue, never, never>>>

export type ScopeServices<S extends ScopeMap> = {
  readonly [K in keyof S]: S[K] extends Effect.Effect<infer A, never, infer _R> ? A : never
}

export type ScopeIdentifiers<S extends ScopeMap> = {
  [K in keyof S]: S[K] extends Effect.Effect<infer _A, never, infer R> ? R : never
}[keyof S]

export function resolve<S extends ScopeMap>(map: S): Effect.Effect<ScopeServices<S>, never, ScopeIdentifiers<S>>
export function resolve(map: ScopeMap): Effect.Effect<Record<string, AnyValue>, never, never> {
  return Effect.gen(function*() {
    const out: Record<string, AnyValue> = {}
    for (const [key, tag] of Object.entries(map)) {
      out[key] = yield* tag
    }
    return out
  })
}
