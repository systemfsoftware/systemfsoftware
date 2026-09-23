import { Readiness } from '@systemfsoftware/effect-readiness'
import { Context, Effect, Layer, Match, Ref } from 'effect'

/** How the fake host socket answers each dial: ready, never ready, or never answering at all. */
export type DialMode = 'connected' | 'refused' | 'hang'

export class ProbeHarness extends Context.Service<ProbeHarness, {
  readonly dials: Effect.Effect<number>
  readonly answerWith: (mode: DialMode) => Effect.Effect<void>
}>()('@systemfsoftware/effect-readiness/tests/ProbeHarness') {}

type DialAnswer = { readonly _tag: 'Connected' } | { readonly _tag: 'Refused' }

const answerOf = (mode: DialMode): Effect.Effect<DialAnswer> =>
  Match.value(mode).pipe(
    Match.when('connected', (): Effect.Effect<DialAnswer> => Effect.succeed({ _tag: 'Connected' })),
    Match.when('refused', (): Effect.Effect<DialAnswer> => Effect.succeed({ _tag: 'Refused' })),
    Match.when('hang', () => Effect.never),
    Match.exhaustive,
  )

const hostProberOver = (dials: Ref.Ref<number>, mode: Ref.Ref<DialMode>): Layer.Layer<Readiness.HostProber> =>
  Layer.succeed(Readiness.HostProber, {
    dial: () =>
      Effect.gen(function*() {
        yield* Ref.update(dials, (count) => count + 1)
        return yield* answerOf(yield* Ref.get(mode))
      }),
    exchange: () => Effect.succeed({ _tag: 'Refused' as const }),
  })

/** A guest socket that answers every dial the way its scenario declares, and counts the dials. */
export const probeHarness: Layer.Layer<Readiness.HostProber | Readiness.LogSource | ProbeHarness> = Layer.unwrap(
  Effect.gen(function*() {
    const dials = yield* Ref.make(0)
    const mode = yield* Ref.make<DialMode>('refused')
    return Layer.mergeAll(
      hostProberOver(dials, mode),
      Layer.succeed(Readiness.LogSource, { entries: Effect.succeed([]) }),
      Layer.succeed(ProbeHarness, {
        dials: Ref.get(dials),
        answerWith: (next) => Ref.set(mode, next),
      }),
    )
  }),
)
