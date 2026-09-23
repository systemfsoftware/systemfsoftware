import { TaskRef } from '@systemfsoftware/effect-spec-runtime'
import { Effect, Option } from 'effect'
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
