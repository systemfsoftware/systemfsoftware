import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, listEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  CreateK2Stream,
  DeleteK2Stream,
  GetK2Stream,
  K2Applied,
  K2Command,
  K2Outcome,
  K2Refused,
  K2Stream,
  K2StreamState,
  ListK2Streams,
  ListK2Subscriptions,
  PatchK2Stream,
} from './k2-stream.schema.js'
import type { K2Http, K2WorkerBinding } from './k2-stream.schema.js'

const notFound = (state: K2StreamState): K2Refused =>
  K2Refused.make({ state, status: 404, body: failureEnvelope({ code: 10006, message: 'K2 stream not found.' }) })

const conflict = (state: K2StreamState, name: string): K2Refused =>
  K2Refused.make({
    state,
    status: 409,
    body: failureEnvelope({ code: 1003, message: `A stream named ${name} already exists.` }),
  })

const defaultRetention = (retention: number | undefined): number =>
  Option.getOrElse(Option.fromUndefinedOr(retention), () => 604800)

const defaultWorkerBinding = (binding: K2WorkerBinding | undefined): K2WorkerBinding =>
  Option.getOrElse(Option.fromUndefinedOr(binding), (): K2WorkerBinding => ({ enabled: false }))

const buildStream = (command: K2Command, request: CreateK2Stream): K2Stream => ({
  created_at: command.now,
  endpoint: `https://${command.newId}.k2.cloudflarestorage.com`,
  http: request.http,
  id: command.newId,
  modified_at: command.now,
  name: request.name,
  retention_seconds: defaultRetention(request.retention_seconds),
  worker_binding: defaultWorkerBinding(request.worker_binding),
})

const nameTaken = (state: K2StreamState, name: string): boolean =>
  Array.contains(Array.map(state, (stream) => stream.name), name)

const createStream = (command: K2Command, request: CreateK2Stream): K2Outcome => {
  const created = buildStream(command, request)
  const state = Array.append(command.state, created)
  return Match.value(nameTaken(command.state, request.name)).pipe(
    Match.when(true, () => conflict(command.state, request.name)),
    Match.when(false, () => K2Applied.make({ state, status: 200, body: successEnvelope(created) })),
    Match.exhaustive,
  )
}

const matchesName = (name: string | undefined) => (stream: K2Stream): boolean =>
  Option.match(Option.fromUndefinedOr(name), {
    onNone: () => true,
    onSome: (wanted) => stream.name === wanted,
  })

const listStreams = (command: K2Command, request: ListK2Streams): K2Outcome => {
  const filtered = Array.filter(command.state, matchesName(request.name))
  const page = Option.getOrElse(Option.fromUndefinedOr(request.page), () => 1)
  const perPage = Option.getOrElse(Option.fromUndefinedOr(request.per_page), () => filtered.length)
  return K2Applied.make({
    state: command.state,
    status: 200,
    body: listEnvelope({ result: filtered, info: { page, per_page: perPage, total_count: filtered.length } }),
  })
}

const findStream = (state: K2StreamState, id: string): Option.Option<K2Stream> =>
  Array.findFirst(state, (stream) => stream.id === id)

const getStream = (command: K2Command, request: GetK2Stream): K2Outcome =>
  Option.match(findStream(command.state, request.stream_id), {
    onNone: () => notFound(command.state),
    onSome: (stream) => K2Applied.make({ state: command.state, status: 200, body: successEnvelope(stream) }),
  })

const deleteStream = (command: K2Command, request: DeleteK2Stream): K2Outcome => {
  const state = Array.filter(command.state, (stream) => stream.id !== request.stream_id)
  return K2Applied.make({ state, status: 200, body: successEnvelope({}) })
}

const patchOf = (command: K2Command, request: PatchK2Stream, stream: K2Stream): K2Stream => ({
  ...stream,
  http: Option.getOrElse(Option.fromUndefinedOr(request.http), (): K2Http => stream.http),
  retention_seconds: Option.getOrElse(
    Option.fromUndefinedOr(request.retention_seconds),
    () => stream.retention_seconds,
  ),
  worker_binding: Option.getOrElse(
    Option.fromUndefinedOr(request.worker_binding),
    (): K2WorkerBinding => stream.worker_binding,
  ),
  modified_at: command.now,
})

const replaceStream = (command: K2Command, request: PatchK2Stream, stream: K2Stream): K2StreamState => {
  const patched = patchOf(command, request, stream)
  return Array.map(command.state, (candidate) =>
    Match.value(candidate.id === stream.id).pipe(
      Match.when(true, () => patched),
      Match.when(false, () => candidate),
      Match.exhaustive,
    ))
}

const patchStream = (command: K2Command, request: PatchK2Stream): K2Outcome =>
  Option.match(findStream(command.state, request.stream_id), {
    onNone: () => notFound(command.state),
    onSome: (stream) =>
      K2Applied.make({
        state: replaceStream(command, request, stream),
        status: 200,
        body: successEnvelope(patchOf(command, request, stream)),
      }),
  })

const listSubscriptions = (command: K2Command, request: ListK2Subscriptions): K2Outcome =>
  Option.match(findStream(command.state, request.stream_id), {
    onNone: () => notFound(command.state),
    onSome: () => K2Applied.make({ state: command.state, status: 200, body: successEnvelope([]) }),
  })

const decide = (command: K2Command): Result.Result<K2Outcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('CreateK2Stream', (request) => createStream(command, request)),
      Match.tag('ListK2Streams', (request) => listStreams(command, request)),
      Match.tag('GetK2Stream', (request) => getStream(command, request)),
      Match.tag('DeleteK2Stream', (request) => deleteStream(command, request)),
      Match.tag('PatchK2Stream', (request) => patchStream(command, request)),
      Match.tag('ListK2Subscriptions', (request) => listSubscriptions(command, request)),
      Match.exhaustive,
    ),
  )

export const k2Stream = Workflow.make({
  command: K2Command,
  decision: K2Outcome,
  error: Schema.Never,
  decide,
})
