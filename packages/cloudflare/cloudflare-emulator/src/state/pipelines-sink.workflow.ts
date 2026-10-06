import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, listEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  CreateSink,
  DeleteSink,
  GetSink,
  ListSinks,
  PipelinesApplied,
  PipelinesCommand,
  PipelinesOutcome,
  PipelinesRefused,
  PipelinesSink,
  PipelinesSinkState,
} from './pipelines-sink.schema.js'

const notFound = (state: PipelinesSinkState): PipelinesRefused =>
  PipelinesRefused.make({ state, status: 404, body: failureEnvelope({ code: 10006, message: 'Sink not found.' }) })

const conflict = (state: PipelinesSinkState, name: string): PipelinesRefused =>
  PipelinesRefused.make({ state, status: 409, body: failureEnvelope({ code: 1003, message: `A sink named ${name} already exists.` }) })

const missingBody = (state: PipelinesSinkState): PipelinesRefused =>
  PipelinesRefused.make({ state, status: 400, body: failureEnvelope({ code: 10012, message: 'A request body is required to create a sink.' }) })

const nameTaken = (state: PipelinesSinkState, name: string): boolean =>
  Array.contains(Array.map(state, (sink) => sink.name), name)

const buildSink = (command: PipelinesCommand, request: CreateSink): PipelinesSink => ({
  created_at: command.now,
  id: command.newId,
  modified_at: command.now,
  name: request.name,
  type: request.type,
})

const createSink = (command: PipelinesCommand, request: CreateSink): PipelinesOutcome => {
  const created = buildSink(command, request)
  const state = Array.append(command.state, created)
  return Match.value(nameTaken(command.state, request.name)).pipe(
    Match.when(true, () => conflict(command.state, request.name)),
    Match.when(false, () => PipelinesApplied.make({ state, status: 200, body: successEnvelope(created) })),
    Match.exhaustive,
  )
}

const matchesName = (name: string | undefined) =>
  (sink: PipelinesSink): boolean =>
    Option.match(Option.fromUndefinedOr(name), {
      onNone: () => true,
      onSome: (wanted) => sink.name === wanted,
    })

const listSinks = (command: PipelinesCommand, request: ListSinks): PipelinesOutcome => {
  const filtered = Array.filter(command.state, matchesName(request.name))
  const page = Option.getOrElse(Option.fromUndefinedOr(request.page), () => 1)
  const perPage = Option.getOrElse(Option.fromUndefinedOr(request.per_page), () => filtered.length)
  return PipelinesApplied.make({
    state: command.state,
    status: 200,
    body: listEnvelope({ result: filtered, info: { page, per_page: perPage, total_count: filtered.length } }),
  })
}

const findSink = (state: PipelinesSinkState, id: string): Option.Option<PipelinesSink> =>
  Array.findFirst(state, (sink) => sink.id === id)

const getSink = (command: PipelinesCommand, request: GetSink): PipelinesOutcome =>
  Option.match(findSink(command.state, request.sink_id), {
    onNone: () => notFound(command.state),
    onSome: (sink) => PipelinesApplied.make({ state: command.state, status: 200, body: successEnvelope(sink) }),
  })

const deleteSink = (command: PipelinesCommand, request: DeleteSink): PipelinesOutcome => {
  const state = Array.filter(command.state, (sink) => sink.id !== request.sink_id)
  return PipelinesApplied.make({ state, status: 200, body: successEnvelope({}) })
}

const decide = (command: PipelinesCommand): Result.Result<PipelinesOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('CreateSink', (request) => createSink(command, request)),
      Match.tag('CreateSinkWithoutBody', () => missingBody(command.state)),
      Match.tag('ListSinks', (request) => listSinks(command, request)),
      Match.tag('GetSink', (request) => getSink(command, request)),
      Match.tag('DeleteSink', (request) => deleteSink(command, request)),
      Match.exhaustive,
    ),
  )

export const pipelinesSink = Workflow.make({
  command: PipelinesCommand,
  decision: PipelinesOutcome,
  error: Schema.Never,
  decide,
})
