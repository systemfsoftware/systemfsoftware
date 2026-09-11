import * as api from '@opentelemetry/api'
import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import type { MetricsResult } from '@systemfsoftware/stryker-js/Metrics'
import type * as reportApi from '@systemfsoftware/stryker-js/Report'
import type { ReporterEvent, ReporterFactory, ReporterInit } from '@systemfsoftware/stryker-js/Reporter'
import { MutationTestReportReady } from '@systemfsoftware/stryker-js/Reporter'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import type * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as HashSet from 'effect/HashSet'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import * as S from 'effect/Schema'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'

import { ConfigError } from './Config.schema.js'

export const REPORTER_STREAM_QUEUE_BOUND = 256

export type ReporterStreamState = 'streaming' | 'terminal' | 'detached'

export interface ReporterAttachment {
  readonly name: string
  readonly inbox: Queue.Queue<ReporterEvent, Cause.Done>
  readonly queue: Queue.Queue<ReporterEvent, Cause.Done>
  readonly state: Ref.Ref<ReporterStreamState>
  readonly emitter: Fiber.Fiber<void>
  readonly consumer: Promise<void>
}

export interface ReporterStage {
  readonly attachments: readonly ReporterAttachment[]
}

export interface ReporterDrainSummary {
  readonly terminalFailed: readonly string[]
}

export interface AttachReporterInput {
  readonly name: string
  readonly factory: ReporterFactory
}

export const isTerminalReportEvent = (event: ReporterEvent): boolean => S.is(MutationTestReportReady)(event)

export const validateReporterNames = (
  configured: readonly string[],
  available: readonly string[],
): Effect.Effect<void, ConfigError> => {
  const known = HashSet.fromIterable(available.map((name) => name.toLowerCase()))
  const unknown = configured.filter((name) => !HashSet.has(known, name.toLowerCase()))
  if (unknown.length === 0) {
    return Effect.void
  }
  const quoted = unknown.map((name) => `"${name}"`).join(', ')
  let candidates = '(none)'
  if (available.length > 0) {
    candidates = available.join(', ')
  }
  let headline = `Unknown reporter ${quoted}.`
  if (unknown.length > 1) {
    headline = `Unknown reporters ${quoted}.`
  }
  return Effect.fail(new ConfigError({ message: `${headline} Available reporters: ${candidates}.` }))
}

export const acquireReporterIterator = <A>(
  events: AsyncIterable<A>,
): Effect.Effect<AsyncIterator<A>, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => events[Symbol.asyncIterator]()),
    (iterator) => Effect.promise(() => Promise.resolve(iterator.return?.()).then(() => undefined)).pipe(Effect.ignore),
  )

interface EmitterPorts {
  readonly inbox: Queue.Queue<ReporterEvent, Cause.Done>
  readonly queue: Queue.Queue<ReporterEvent, Cause.Done>
  readonly state: Ref.Ref<ReporterStreamState>
}

const markDetached = (ports: EmitterPorts): void => {
  if (Effect.runSync(Ref.get(ports.state)) !== 'terminal') {
    Effect.runSync(Ref.set(ports.state, 'detached'))
    Effect.runSync(Queue.shutdown(ports.queue))
    Effect.runSync(Queue.shutdown(ports.inbox))
  }
}

const pumpEmitter = (ports: EmitterPorts): Effect.Effect<void> =>
  Stream.fromQueue(ports.inbox).pipe(
    Stream.runForEach((event) => Effect.asVoid(Queue.offer(ports.queue, event))),
    Effect.ensuring(Effect.asVoid(Queue.end(ports.queue))),
  )

export const attachReporterFactories = (
  inputs: readonly AttachReporterInput[],
  options: StrykerOptions,
  init: ReporterInit,
): Effect.Effect<readonly ReporterAttachment[], never, Scope.Scope> =>
  Effect.forEach(inputs, (input) =>
    Effect.gen(function*() {
      const inbox = yield* Queue.unbounded<ReporterEvent, Cause.Done>()
      const queue = yield* Queue.bounded<ReporterEvent, Cause.Done>(REPORTER_STREAM_QUEUE_BOUND)
      const state = yield* Ref.make<ReporterStreamState>('streaming')
      const events = Stream.toAsyncIterable(Stream.fromQueue(queue))
      const iterator = yield* acquireReporterIterator(events)
      const ports: EmitterPorts = { inbox, queue, state }
      const singleUse: AsyncIterable<ReporterEvent> = {
        [Symbol.asyncIterator]: () => {
          const observe = (result: IteratorResult<ReporterEvent>): IteratorResult<ReporterEvent> => {
            if (result.done !== true && isTerminalReportEvent(result.value)) {
              Effect.runSync(Ref.set(ports.state, 'terminal'))
            }
            return result
          }
          return {
            next: async () => observe(await iterator.next()),
            return: async (value) => {
              const settled = await iterator.return?.(value)
              return settled ?? { done: true, value: undefined }
            },
          }
        },
      }
      let consumer: Promise<void>
      try {
        consumer = input.factory(options, init)(singleUse)
      } catch (reason) {
        consumer = Promise.reject(reason)
      }
      const emitter = yield* Effect.forkScoped(pumpEmitter(ports))
      const attachment: ReporterAttachment = { name: input.name, inbox, queue, state, emitter, consumer }
      void consumer.then(
        () => markDetached(ports),
        () => markDetached(ports),
      )
      return attachment
    }))
export const offerReporterEvent = (
  stage: Pick<ReporterStage, 'attachments'>,
  event: ReporterEvent,
): Effect.Effect<void, never> =>
  Effect.forEach(stage.attachments, (attachment) =>
    Effect.gen(function*() {
      if ((yield* Ref.get(attachment.state)) === 'detached') {
        return
      }
      const offered = yield* Queue.offer(attachment.inbox, event)
      if (!offered && (yield* Ref.get(attachment.state)) !== 'detached') {
        yield* Effect.logWarning(`Reporter "${attachment.name}" stream closed before an event could be delivered.`)
      }
    }), { discard: true })

export const offerTerminalReport = (
  stage: Pick<ReporterStage, 'attachments'>,
  report: reportApi.MutationTestResult,
  metrics: MetricsResult,
): Effect.Effect<void, never> => offerReporterEvent(stage, new MutationTestReportReady({ report, metrics }))

export const terminalDrainClass = (summary: ReporterDrainSummary): ExitClass | null => {
  if (summary.terminalFailed.length > 0) {
    return 'RuntimeError'
  }
  return null
}

type ReporterDrainOutcome =
  | { readonly kind: 'completed'; readonly name: string }
  | { readonly kind: 'detached'; readonly name: string }
  | { readonly kind: 'terminal-failed'; readonly name: string }

const settleAttachment = (attachment: ReporterAttachment): Effect.Effect<ReporterDrainOutcome, never, never> =>
  Effect.gen(function*() {
    const exit = yield* Effect.exit(Effect.promise(() => attachment.consumer))
    if (Exit.isSuccess(exit)) {
      const completed: ReporterDrainOutcome = { kind: 'completed', name: attachment.name }
      return completed
    }
    if ((yield* Ref.get(attachment.state)) === 'terminal') {
      yield* Effect.logError(`Reporter "${attachment.name}" failed while draining the terminal report.`).pipe(
        Effect.annotateLogs('cause', exit.cause),
      )
      const failed: ReporterDrainOutcome = { kind: 'terminal-failed', name: attachment.name }
      return failed
    }
    yield* Effect.logWarning(
      `Reporter "${attachment.name}" failed before the terminal report and was detached; exit code unchanged.`,
    ).pipe(Effect.annotateLogs('cause', exit.cause))
    const detached: ReporterDrainOutcome = { kind: 'detached', name: attachment.name }
    return detached
  })

export const closeReporterStage = (
  stage: Pick<ReporterStage, 'attachments'>,
): Effect.Effect<ReporterDrainSummary, never, never> =>
  Effect.gen(function*() {
    yield* Effect.forEach(stage.attachments, (attachment) => Queue.end(attachment.inbox), { discard: true })
    yield* Effect.forEach(stage.attachments, (attachment) => Effect.exit(Fiber.join(attachment.emitter)), {
      discard: true,
    })
    const outcomes = yield* Effect.forEach(stage.attachments, settleAttachment, { concurrency: 'unbounded' })
    const terminalFailed: string[] = []
    for (const outcome of outcomes) {
      if (outcome.kind === 'terminal-failed') {
        terminalFailed.push(outcome.name)
      }
    }
    return { terminalFailed }
  })

const ENGINE_TRACER_NAME = 'stryker-js-engine'

const formatTraceparent = (context: api.SpanContext): string =>
  `00-${context.traceId}-${context.spanId}-${(context.traceFlags & 0xff).toString(16).padStart(2, '0')}`

const initFromSpanContext = (context: api.SpanContext | undefined): ReporterInit | undefined => {
  if (context === undefined || !api.trace.isSpanContextValid(context)) {
    return undefined
  }
  const serialized = context.traceState?.serialize()
  if (serialized === undefined || serialized === '') {
    return { traceparent: formatTraceparent(context) }
  }
  return { traceparent: formatTraceparent(context), tracestate: serialized }
}

const initFromEnvironment = (): ReporterInit | undefined => {
  const traceparent = process.env['TRACEPARENT']
  const tracestate = process.env['TRACESTATE']
  if (traceparent !== undefined && tracestate !== undefined) {
    return { traceparent, tracestate }
  }
  if (traceparent !== undefined) {
    return { traceparent }
  }
  if (tracestate !== undefined) {
    return { tracestate }
  }
  return undefined
}

export const currentReporterInit = (span?: api.Span): ReporterInit =>
  initFromSpanContext(span?.spanContext()) ??
    initFromSpanContext(api.trace.getSpan(api.context.active())?.spanContext()) ??
    initFromEnvironment() ??
    {}

export const withPhaseSpan = <A, E, R>(
  spanName: string,
  attributes: Record<string, string | number>,
  effect: (span: api.Span) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.flatMap(
    Effect.sync(() =>
      api.trace.getTracer(ENGINE_TRACER_NAME).startSpan(spanName, { attributes }, api.context.active())
    ),
    (span) => effect(span).pipe(Effect.ensuring(Effect.sync(() => span.end()))),
  )
