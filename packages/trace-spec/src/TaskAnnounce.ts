import { TaskRef } from '@systemfsoftware/effect-spec-runtime'
import { Effect, Schema } from 'effect'
import type { TraceDisparityError } from './TraceDisparityError.schema.js'

export interface Annotate {
  (message: string, type?: string): Promise<void> | void
}

const dispatchAnnotate = (annotate: Annotate | undefined, message: string, type: string): Effect.Effect<void> => {
  if (typeof annotate === 'function') {
    return Effect.promise(() => Promise.resolve(annotate(message, type)))
  }
  return Effect.void
}

const recordAnnotation = (
  taskContext: TaskRef.VitestTaskContext | null,
  message: string,
  type: string,
): Effect.Effect<void> => {
  if (taskContext === null) return Effect.void
  return dispatchAnnotate(taskContext.annotate, message, type)
}

const record = (message: string, type: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    const taskContext = yield* TaskRef.RawVitestTaskRef
    return yield* recordAnnotation(taskContext, message, type)
  })

export const announceDump = (error: TraceDisparityError): Effect.Effect<void> =>
  error.dumpPath === null
    ? Effect.void
    : record(`trace contract failed; observed graph dumped to ${error.dumpPath}`, 'info')

export const announceCounterexample = <Input>(input: Input): Effect.Effect<void> =>
  record(`shrunk counterexample input: ${JSON.stringify(input)}`, 'info')

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  it.prop(
    '∀m_DispatchAnnotate_=VoidWhenNoFunction',
    [Schema.String],
    ([message]) => Effect.sync(() => Effect.runSync(dispatchAnnotate(undefined, message, 'info')) === void 0),
  )

  it.prop(
    '∀n_DispatchAnnotate_=AwaitedRecord',
    [Schema.Finite],
    ([n]) =>
      Effect.gen(function*() {
        const recorded: Array<string> = []
        const emit = (message: string): Promise<void> => {
          recorded.push(message)
          return Promise.resolve()
        }
        yield* dispatchAnnotate(emit, `m${n}`, 'info')
        return recorded.length === 1 && recorded[0] === `m${n}`
      }),
  )
}
