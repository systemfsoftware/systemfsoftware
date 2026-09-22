import { TaskRef } from '@systemfsoftware/effect-spec-runtime'
import { Effect, Option, Schema } from 'effect'
import type { TraceDisparityError } from './TraceDisparityError.schema.js'

export interface Annotate {
  (message: string, type?: string): Promise<void> | void
}

const dispatchAnnotate = (annotate: Annotate | undefined, message: string, type: string): Effect.Effect<void> =>
  Option.match(Option.fromNullishOr(annotate), {
    onNone: () => Effect.void,
    onSome: (record) => Effect.promise(() => Promise.resolve(record(message, type))),
  })

const announcement = (
  taskContext: TaskRef.VitestTaskContext | null,
  message: string,
  type: string,
): Effect.Effect<void> =>
  Option.match(Option.fromNullishOr(taskContext), {
    onNone: () => Effect.void,
    onSome: (context) => dispatchAnnotate(context.annotate, message, type),
  })

const record = (message: string, type: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    const taskContext = yield* TaskRef.RawVitestTaskRef
    return yield* announcement(taskContext, message, type)
  })

export const announceDump = (error: TraceDisparityError): Effect.Effect<void> =>
  Option.match(Option.fromNullishOr(error.dumpPath), {
    onNone: () => Effect.void,
    onSome: (dumpPath) => record(`trace contract failed; observed graph dumped to ${dumpPath}`, 'info'),
  })

export const announceCounterexample = <Input>(input: Input): Effect.Effect<void> =>
  record(`shrunk counterexample input: ${JSON.stringify(input)}`, 'info')

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')
  const { Ref } = await import('effect')

  const recorded = Ref.makeUnsafe<ReadonlyArray<string>>([])

  const emit = (message: string): Promise<void> =>
    Effect.runPromise(Ref.update(recorded, (messages) => [...messages, message]))

  it.prop(
    '∀m_DispatchAnnotate_=VoidWhenNoFunction',
    [Schema.String],
    ([message]) => Effect.sync(() => Effect.runSync(dispatchAnnotate(undefined, message, 'info')) === void 0),
  )

  it.prop(
    '∀n_Annotate_=AwaitedRecord',
    [Schema.Finite],
    ([n]) =>
      Effect.gen(function*() {
        yield* Ref.set(recorded, [])
        yield* dispatchAnnotate(emit, `m${n}`, 'info')
        const messages = yield* Ref.get(recorded)
        return messages.length === 1 && messages[0] === `m${n}`
      }),
  )
}
