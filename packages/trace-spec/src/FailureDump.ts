import type { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Option, Schema } from 'effect'
import * as PlatformError from 'effect/PlatformError'
import type { SpanRecord } from './graph.schema.js'
import { Break, type Verdict } from './Verdict.schema.js'

export interface Observed {
  readonly traceId: string
  readonly spans: ReadonlyArray<SpanRecord>
}

export interface DumpRequest extends Observed {
  readonly conjunct: string
  readonly report: string
  readonly name?: string | undefined
}

const DEFAULT_DIRECTORY = 'artifacts/traces'

const isBreak = Schema.is(Break)

/**
 * The rendered evidence a break carries; a held verdict leaves nothing to write.
 */
export const report = (verdict: Verdict): Option.Option<string> =>
  Option.map(Option.liftPredicate(verdict, isBreak), renderBreach)

const renderValue = (value: Span.AttributeValue): string => JSON.stringify(value)

const renderEntries = (entries: Iterable<readonly [string, Span.AttributeValue]>): string =>
  [...entries].map(([key, value]) => `${key}=${renderValue(value)}`).join(' ')

const indentOf = (depth: number): string => '  '.repeat(depth)

const renderBreach = (breach: Break): string =>
  `break ${breach.conjunct} inspected=[${breach.inspected.join(', ')}]\n${indentOf(1)}${breach.detail}`

const childrenOf = (spans: ReadonlyArray<SpanRecord>, spanId: string): ReadonlyArray<SpanRecord> =>
  spans.filter((span) => span.parentSpanId === spanId)

const renderNode = (spans: ReadonlyArray<SpanRecord>, node: SpanRecord, depth: number): string => {
  const head = `${indentOf(depth)}${node.name} (${node.spanId}) status=${node.status} error.type=${
    String(node.errorType)
  } duration=${node.durationMillis}ms`
  const tail = [
    `${indentOf(depth)}  attrs: ${renderEntries(Object.entries(node.attributes))}`,
    ...node.events.map((event) =>
      `${indentOf(depth)}  event ${event.name} ${renderEntries(Object.entries(event.attributes))}`
    ),
    ...node.links.map((link) => `${indentOf(depth)}  link ${link.traceId}/${link.spanId}`),
    ...childrenOf(spans, node.spanId).map((child) => renderNode(spans, child, depth + 1)),
  ]
  return [head, ...tail].join('\n')
}

/**
 * The dump document: the trace it belongs to, the break that refused it, and the recorded
 * spans as the observation window saw them.
 */
export const document = (observed: Observed, report: string): string =>
  [`trace ${observed.traceId}`, report, ...observed.spans.map((node) => renderNode(observed.spans, node, 0))].join('\n')

const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '-')

const fileNameOf = (request: DumpRequest): string =>
  `${sanitize(request.name ?? request.traceId)}.${sanitize(request.conjunct)}.txt`

/**
 * Writes the dump under the artifacts directory and answers with its path. The file is
 * named after the request's name when one is given — a generated case names its dump after
 * itself, so every failing draw overwrites one file and the last write is the reported
 * counterexample.
 */
export const write = (
  request: DumpRequest,
): Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(DEFAULT_DIRECTORY, { recursive: true })
    const path = `${DEFAULT_DIRECTORY}/${fileNameOf(request)}`
    yield* fs.writeFileString(path, document(request, request.report))
    return path
  })
