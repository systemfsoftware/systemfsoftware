import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Order, Record, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  CreateDestination,
  DeleteDestination,
  DestinationApplied,
  DestinationCommand,
  DestinationOutcome,
  DestinationRefused,
  ListDestinations,
  UpdateDestination,
} from './observability-destination.schema.js'
import type {
  CreateDestinationInput,
  DestinationJobStatus,
  ObservabilityDestination,
  ObservabilityDestinationState,
  UpdateDestinationInput,
} from './observability-destination.schema.js'

const notFoundMessage = 'The destination was not found.'
const pageDefault = 1
const perPageDefault = 20
const orderDefault: 'asc' | 'desc' = 'desc'
const orderByDefault: 'created' | 'updated' = 'updated'

const emptyJobStatus: DestinationJobStatus = { error_message: '', last_complete: '', last_error: '' }

const notFound = (state: ObservabilityDestinationState): DestinationRefused =>
  DestinationRefused.make({ state, status: 404, body: failureEnvelope({ code: 10006, message: notFoundMessage }) })

const logpushJobOf = (newId: string): number => Number.parseInt(newId, 16)

const destinationConf = (url: string, headers: Readonly<Record<string, string>>): string => {
  const params = Array.map(Record.toEntries(headers), ([name, value]) => `header_${name}=${value}`)
  return Match.value(params.length === 0).pipe(
    Match.when(true, () => url),
    Match.when(false, () => `${url}?${Array.join(params, '&')}`),
    Match.exhaustive,
  )
}

const listConfiguration = (destination: ObservabilityDestination) => ({
  destination_conf: destination.configuration.destination_conf,
  headers: destination.configuration.headers,
  jobStatus: destination.configuration.jobStatus,
  logpushDataset: destination.configuration.logpushDataset,
  type: destination.configuration.type,
  url: destination.configuration.url,
})

const singleConfiguration = (destination: ObservabilityDestination) => ({
  destination_conf: destination.configuration.destination_conf,
  logpushDataset: destination.configuration.logpushDataset,
  logpushJob: destination.configuration.logpushJob,
  type: destination.configuration.type,
  url: destination.configuration.url,
})

const listEntry = (destination: ObservabilityDestination) => ({
  configuration: listConfiguration(destination),
  enabled: destination.enabled,
  name: destination.name,
  scripts: destination.scripts,
  slug: destination.slug,
})

const singleEntry = (destination: ObservabilityDestination) => ({
  configuration: singleConfiguration(destination),
  enabled: destination.enabled,
  name: destination.name,
  scripts: destination.scripts,
  slug: destination.slug,
})

const inAccount = (account_id: string) => (destination: ObservabilityDestination): boolean =>
  destination.account_id === account_id

const findDestination = (
  state: ObservabilityDestinationState,
  account_id: string,
  slug: string,
): Option.Option<ObservabilityDestination> =>
  Array.findFirst(
    state,
    (destination) =>
      Array.every([destination.account_id === account_id, destination.slug === slug], (matches) => matches),
  )

const byCreated = Order.mapInput(Order.String, (destination: ObservabilityDestination) => destination.created)
const byUpdated = Order.mapInput(Order.String, (destination: ObservabilityDestination) => destination.updated)

const orderFor = (orderBy: 'created' | 'updated') =>
  Match.value(orderBy).pipe(
    Match.when('created', () => byCreated),
    Match.when('updated', () => byUpdated),
    Match.exhaustive,
  )

const sorted = (
  destinations: ReadonlyArray<ObservabilityDestination>,
  order: 'asc' | 'desc',
  orderBy: 'created' | 'updated',
): ReadonlyArray<ObservabilityDestination> =>
  Match.value(order).pipe(
    Match.when('asc', () => Array.sort(destinations, orderFor(orderBy))),
    Match.when('desc', () => Array.reverse(Array.sort(destinations, orderFor(orderBy)))),
    Match.exhaustive,
  )

const listDestinations = (command: DestinationCommand, request: ListDestinations): DestinationOutcome => {
  const matched = Array.filter(command.state, inAccount(request.account_id))
  const order = Option.getOrElse(Option.fromUndefinedOr(request.order), () => orderDefault)
  const orderBy = Option.getOrElse(Option.fromUndefinedOr(request.orderBy), () => orderByDefault)
  const page = Option.getOrElse(Option.fromUndefinedOr(request.page), () => pageDefault)
  const perPage = Option.getOrElse(Option.fromUndefinedOr(request.perPage), () => perPageDefault)
  const ordered = sorted(matched, order, orderBy)
  const entries = Array.map(Array.take(Array.drop(ordered, (page - 1) * perPage), perPage), listEntry)
  return DestinationApplied.make({ body: successEnvelope(entries), state: command.state, status: 200 })
}

const buildDestination = (
  command: DestinationCommand,
  account_id: string,
  body: CreateDestinationInput,
): ObservabilityDestination => ({
  account_id,
  configuration: {
    destination_conf: destinationConf(body.configuration.url, body.configuration.headers),
    headers: body.configuration.headers,
    jobStatus: emptyJobStatus,
    logpushDataset: body.configuration.logpushDataset,
    logpushJob: logpushJobOf(command.newId),
    type: body.configuration.type,
    url: body.configuration.url,
  },
  created: command.now,
  enabled: body.enabled,
  name: body.name,
  scripts: [],
  slug: command.newId,
  updated: command.now,
})

const createDestination = (command: DestinationCommand, request: CreateDestination): DestinationOutcome => {
  const destination = buildDestination(command, request.account_id, request.body)
  return DestinationApplied.make({
    body: successEnvelope(singleEntry(destination)),
    state: Array.append(command.state, destination),
    status: 201,
  })
}

const withUpdate = (
  command: DestinationCommand,
  destination: ObservabilityDestination,
  body: UpdateDestinationInput,
): ObservabilityDestination => ({
  ...destination,
  configuration: {
    ...destination.configuration,
    destination_conf: destinationConf(body.configuration.url, body.configuration.headers),
    headers: body.configuration.headers,
    url: body.configuration.url,
  },
  enabled: body.enabled,
  updated: command.now,
})

const updateDestination = (command: DestinationCommand, request: UpdateDestination): DestinationOutcome =>
  Option.match(findDestination(command.state, request.account_id, request.slug), {
    onNone: () => notFound(command.state),
    onSome: (destination) => {
      const updated = withUpdate(command, destination, request.body)
      return DestinationApplied.make({
        body: successEnvelope(singleEntry(updated)),
        state: Array.append(
          Array.filter(
            command.state,
            (candidate) =>
              Array.every(
                [candidate.account_id === request.account_id, candidate.slug === request.slug],
                (matches) => matches,
              ) === false,
          ),
          updated,
        ),
        status: 200,
      })
    },
  })

const deleteDestination = (command: DestinationCommand, request: DeleteDestination): DestinationOutcome =>
  Option.match(findDestination(command.state, request.account_id, request.slug), {
    onNone: () => notFound(command.state),
    onSome: (destination) =>
      DestinationApplied.make({
        body: successEnvelope(singleEntry(destination)),
        state: Array.filter(
          command.state,
          (candidate) =>
            Array.every([candidate.account_id === request.account_id, candidate.slug === request.slug], (matches) =>
              matches) === false,
        ),
        status: 200,
      }),
  })

const decide = (command: DestinationCommand): Result.Result<DestinationOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('ListDestinations', (request) => listDestinations(command, request)),
      Match.tag('CreateDestination', (request) => createDestination(command, request)),
      Match.tag('UpdateDestination', (request) => updateDestination(command, request)),
      Match.tag('DeleteDestination', (request) => deleteDestination(command, request)),
      Match.exhaustive,
    ),
  )

export const observabilityDestination = Workflow.make({
  command: DestinationCommand,
  decision: DestinationOutcome,
  error: Schema.Never,
  decide,
})
