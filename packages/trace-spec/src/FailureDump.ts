import type { Span } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Option } from 'effect'
import type { GraphNode, TraceGraph } from './Graph.js'
import type { Relation } from './Rel.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'
import type { Break } from './Verdict.schema.js'

export interface DisparityInput {
  readonly graph: TraceGraph
  readonly relation: Relation
  readonly break: Break
  readonly directory?: string
}

export const render = (graph: TraceGraph, breaches: ReadonlyArray<Break>): string => {
  const lines = [
    `trace ${graph.traceId}`,
    ...breaches.map(renderBreach),
    ...graph.nodes.map((node) => renderNode(graph, node, 0)),
  ]
  return lines.join('\n')
}

const DEFAULT_DIRECTORY = 'artifacts/traces'

const renderValue = (value: Span.AttributeValue): string => JSON.stringify(value)

const renderEntries = (entries: Iterable<readonly [string, Span.AttributeValue]>): string =>
  [...entries].map(([key, value]) => `${key}=${renderValue(value)}`).join(' ')

const indentOf = (depth: number): string => '  '.repeat(depth)

const renderBreach = (breach: Break): string =>
  `break ${breach.conjunct} inspected=[${breach.inspected.join(', ')}]\n${indentOf(1)}${breach.detail}`

const renderNode = (graph: TraceGraph, node: GraphNode, depth: number): string => {
  const head = `${indentOf(depth)}${node.name} (${node.spanId}) status=${node.status} error.type=${
    String(node.errorType)
  } duration=${node.durationMillis}ms`
  const tail = [
    `${indentOf(depth)}  attrs: ${renderEntries(Object.entries(node.attrs))}`,
    ...node.events.map((event) => `${indentOf(depth)}  event ${event.name} ${renderEntries([...event.attributes])}`),
    ...node.links.map((link) => `${indentOf(depth)}  link ${link.traceId}/${link.spanId}`),
    ...graph.children(node).map((child) => renderNode(graph, child, depth + 1)),
  ]
  return [head, ...tail].join('\n')
}

const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '-')

const directoryOf = (directory: string | undefined): string => directory ?? DEFAULT_DIRECTORY

const fileNameOf = (options: DisparityInput): string =>
  `${sanitize(options.graph.traceId)}.${sanitize(options.relation.id)}.txt`

const writeDump = (options: DisparityInput) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const directory = directoryOf(options.directory)
    const path = `${directory}/${fileNameOf(options)}`
    yield* fs.makeDirectory(directory, { recursive: true })
    yield* fs.writeFileString(path, render(options.graph, [options.break]))
    return path
  })

export const disparity = (options: DisparityInput): Effect.Effect<TraceDisparityError, never, FileSystem.FileSystem> =>
  Effect.map(Effect.option(writeDump(options)), (dumpPath) =>
    TraceDisparityError.make({
      relationId: options.relation.id,
      traceId: options.graph.traceId,
      breaks: [options.break],
      dumpPath: Option.getOrNull(dumpPath),
    }))
