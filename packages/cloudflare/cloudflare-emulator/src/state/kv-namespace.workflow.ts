import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, listEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  CreateNamespace,
  GetNamespace,
  KvApplied,
  KvCommand,
  KvNamespace,
  KvNamespaceState,
  KvOutcome,
  KvRefused,
  ListNamespaces,
  RemoveNamespace,
  RenameNamespace,
} from './kv-namespace.schema.js'

const notFound = (state: KvNamespaceState): KvRefused =>
  KvRefused.make({
    state,
    status: 404,
    body: failureEnvelope({ code: 10013, message: 'The namespace was not found.' }),
  })

const titleTaken = (state: KvNamespaceState, title: string): KvRefused =>
  KvRefused.make({
    state,
    status: 400,
    body: failureEnvelope({ code: 10014, message: `A namespace with the title "${title}" already exists.` }),
  })

const titleRequired = (state: KvNamespaceState): KvRefused =>
  KvRefused.make({ state, status: 400, body: failureEnvelope({ code: 10019, message: 'The title is required.' }) })

const titleExists = (state: KvNamespaceState, title: string): boolean =>
  Array.contains(Array.map(state, (namespace) => namespace.title), title)

const buildNamespace = (command: KvCommand, request: CreateNamespace): KvNamespace => ({
  id: command.newId,
  jurisdiction: request.jurisdiction,
  mode: request.mode,
  supports_url_encoding: false,
  title: request.title,
})

const createNamespace = (command: KvCommand, request: CreateNamespace): KvOutcome => {
  const created = buildNamespace(command, request)
  return Match.value(request.title.length === 0).pipe(
    Match.when(true, () => titleRequired(command.state)),
    Match.when(false, () =>
      Match.value(titleExists(command.state, request.title)).pipe(
        Match.when(true, () => titleTaken(command.state, request.title)),
        Match.when(false, () =>
          KvApplied.make({ state: Array.append(command.state, created), status: 200, body: successEnvelope(created) })),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
}

const listNamespaces = (command: KvCommand, request: ListNamespaces): KvOutcome => {
  const page = Option.getOrElse(Option.fromUndefinedOr(request.page), () => 1)
  const perPage = Option.getOrElse(Option.fromUndefinedOr(request.per_page), () => command.state.length)
  return KvApplied.make({
    state: command.state,
    status: 200,
    body: listEnvelope({ result: command.state, info: { page, per_page: perPage, total_count: command.state.length } }),
  })
}

const findNamespace = (state: KvNamespaceState, id: string): Option.Option<KvNamespace> =>
  Array.findFirst(state, (namespace) => namespace.id === id)

const getNamespace = (command: KvCommand, request: GetNamespace): KvOutcome =>
  Option.match(findNamespace(command.state, request.namespace_id), {
    onNone: () => notFound(command.state),
    onSome: (namespace) => KvApplied.make({ state: command.state, status: 200, body: successEnvelope(namespace) }),
  })

const renameNamespace = (command: KvCommand, request: RenameNamespace): KvOutcome =>
  Option.match(findNamespace(command.state, request.namespace_id), {
    onNone: () => notFound(command.state),
    onSome: (namespace) =>
      KvApplied.make({
        state: applyTitle(command.state, namespace, request.title),
        status: 200,
        body: successEnvelope({ ...namespace, title: request.title }),
      }),
  })

const applyTitle = (state: KvNamespaceState, namespace: KvNamespace, title: string): KvNamespaceState =>
  Array.map(state, (candidate) =>
    Match.value(candidate.id === namespace.id).pipe(
      Match.when(true, () => ({ ...candidate, title })),
      Match.when(false, () => candidate),
      Match.exhaustive,
    ))

const removeNamespace = (command: KvCommand, request: RemoveNamespace): KvOutcome => {
  const state = Array.filter(command.state, (namespace) => namespace.id !== request.namespace_id)
  return KvApplied.make({ state, status: 200, body: successEnvelope({}) })
}

const decide = (command: KvCommand): Result.Result<KvOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('ListNamespaces', (request) => listNamespaces(command, request)),
      Match.tag('CreateNamespace', (request) => createNamespace(command, request)),
      Match.tag('GetNamespace', (request) => getNamespace(command, request)),
      Match.tag('RenameNamespace', (request) => renameNamespace(command, request)),
      Match.tag('RemoveNamespace', (request) => removeNamespace(command, request)),
      Match.exhaustive,
    ),
  )

export const kvNamespace = Workflow.make({
  command: KvCommand,
  decision: KvOutcome,
  error: Schema.Never,
  decide,
})
