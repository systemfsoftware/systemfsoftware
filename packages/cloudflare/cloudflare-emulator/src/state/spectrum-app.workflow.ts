import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, listEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  AWS_EDGE_IPS_DEFAULT,
  CreateSpectrumApp,
  DeleteSpectrumApp,
  GetSpectrumApp,
  ListSpectrumApps,
  PROXY_PROTOCOL_DEFAULT,
  ReplaceSpectrumApp,
  SpectrumApplicationInput,
  SpectrumApplied,
  SpectrumCommand,
  SpectrumOutcome,
  SpectrumRefused,
  TLS_DEFAULT,
  TRAFFIC_TYPE_DEFAULT,
} from './spectrum-app.schema.js'
import type { SpectrumApplication, SpectrumAppState, StoredSpectrumApplication } from './spectrum-app.schema.js'

const invalidBodyMessage = 'The Spectrum application configuration is invalid.'
const workerOriginMessage =
  'A Worker origin is mutually exclusive with origin_direct, origin_dns, origin_port, proxy_protocol, and argo_smart_routing; it requires a tcp protocol and allows tls only "off" or "flexible".'
const dnsNameMessage = 'The application requires a DNS name.'
const identityTakenMessage = 'An application with the same DNS name and protocol already exists in this zone.'
const notFoundMessage = 'Spectrum application not found.'

const invalidBody = (state: SpectrumAppState, message: string): SpectrumRefused =>
  SpectrumRefused.make({ state, status: 400, body: failureEnvelope({ code: 1003, message }) })

const notFound = (state: SpectrumAppState): SpectrumRefused =>
  SpectrumRefused.make({ state, status: 404, body: failureEnvelope({ code: 10006, message: notFoundMessage }) })

const identityTaken = (state: SpectrumAppState): SpectrumRefused =>
  SpectrumRefused.make({ state, status: 409, body: failureEnvelope({ code: 1003, message: identityTakenMessage }) })

const trafficTypeOf = (input: SpectrumApplicationInput) =>
  Option.getOrElse(Option.fromUndefinedOr(input.traffic_type), () => TRAFFIC_TYPE_DEFAULT)

const tlsOf = (input: SpectrumApplicationInput) =>
  Option.getOrElse(Option.fromUndefinedOr(input.tls), () => TLS_DEFAULT)

const nameOf = (input: SpectrumApplicationInput): string =>
  Option.getOrElse(Option.fromUndefinedOr(input.dns.name), () => '')

const workerOriginFields = (input: SpectrumApplicationInput): ReadonlyArray<boolean> => [
  input.argo_smart_routing !== undefined,
  input.origin_direct !== undefined,
  input.origin_dns !== undefined,
  input.origin_port !== undefined,
  input.proxy_protocol !== undefined,
]

const workerOriginViolations = (input: SpectrumApplicationInput): ReadonlyArray<boolean> =>
  Match.value(Array.contains(['worker'], trafficTypeOf(input))).pipe(
    Match.when(false, (): ReadonlyArray<boolean> => []),
    Match.when(true, () => [
      Array.some(workerOriginFields(input), (present) => present),
      Array.contains(['off', 'flexible'], tlsOf(input)) === false,
      input.protocol.startsWith('tcp/') === false,
      Option.isNone(Option.fromUndefinedOr(input.origin_worker_id)),
    ]),
    Match.exhaustive,
  )

const workerOriginViolated = (input: SpectrumApplicationInput): boolean =>
  Array.some(workerOriginViolations(input), (violated) => violated)

const presentFields = (input: SpectrumApplicationInput): Partial<SpectrumApplication> => ({
  ...Option.match(Option.fromUndefinedOr(input.origin_direct), {
    onNone: (): Partial<SpectrumApplication> => ({}),
    onSome: (origin_direct): Partial<SpectrumApplication> => ({ origin_direct }),
  }),
  ...Option.match(Option.fromUndefinedOr(input.origin_dns), {
    onNone: (): Partial<SpectrumApplication> => ({}),
    onSome: (origin_dns): Partial<SpectrumApplication> => ({ origin_dns }),
  }),
  ...Option.match(Option.fromUndefinedOr(input.origin_port), {
    onNone: (): Partial<SpectrumApplication> => ({}),
    onSome: (origin_port): Partial<SpectrumApplication> => ({ origin_port }),
  }),
  ...Option.match(Option.fromUndefinedOr(input.origin_worker_id), {
    onNone: (): Partial<SpectrumApplication> => ({}),
    onSome: (origin_worker_id): Partial<SpectrumApplication> => ({ origin_worker_id }),
  }),
  ...Option.match(Option.fromUndefinedOr(input.virtual_network_id), {
    onNone: (): Partial<SpectrumApplication> => ({}),
    onSome: (virtual_network_id): Partial<SpectrumApplication> => ({ virtual_network_id }),
  }),
})

const buildApplication = (
  command: SpectrumCommand,
  input: SpectrumApplicationInput,
): SpectrumApplication => ({
  argo_smart_routing: Option.getOrElse(Option.fromUndefinedOr(input.argo_smart_routing), () => false),
  created_on: command.now,
  dns: input.dns,
  edge_ips: Option.getOrElse(Option.fromUndefinedOr(input.edge_ips), () => AWS_EDGE_IPS_DEFAULT),
  id: command.newId,
  ip_firewall: Option.getOrElse(Option.fromUndefinedOr(input.ip_firewall), () => false),
  modified_on: command.now,
  protocol: input.protocol,
  proxy_protocol: Option.getOrElse(Option.fromUndefinedOr(input.proxy_protocol), () => PROXY_PROTOCOL_DEFAULT),
  tls: tlsOf(input),
  traffic_type: trafficTypeOf(input),
  ...presentFields(input),
})

const sameIdentity = (zone_id: string, app: SpectrumApplication) => (stored: StoredSpectrumApplication): boolean =>
  Array.every(
    [
      stored.zone_id === zone_id,
      stored.app.dns.name === app.dns.name,
      stored.app.protocol === app.protocol,
    ],
    (matches) => matches,
  )

const holdsIdentity = (state: SpectrumAppState, zone_id: string, app: SpectrumApplication): boolean =>
  Array.some(state, sameIdentity(zone_id, app))

const inZone = (zone_id: string) => (stored: StoredSpectrumApplication): boolean => stored.zone_id === zone_id

const findApp = (state: SpectrumAppState, zone_id: string, app_id: string): Option.Option<StoredSpectrumApplication> =>
  Array.findFirst(
    state,
    (stored) => Array.every([stored.zone_id === zone_id, stored.app.id === app_id], (matches) => matches),
  )

const replaceInState = (
  state: SpectrumAppState,
  zone_id: string,
  app_id: string,
  app: SpectrumApplication,
): SpectrumAppState =>
  Array.map(
    state,
    (stored) =>
      Match.value(Array.every([stored.zone_id === zone_id, stored.app.id === app_id], (matches) => matches)).pipe(
        Match.when(true, (): StoredSpectrumApplication => ({ app, zone_id })),
        Match.when(false, () => stored),
        Match.exhaustive,
      ),
  )

const created = (
  command: SpectrumCommand,
  zone_id: string,
  input: SpectrumApplicationInput,
): SpectrumOutcome => {
  const app = buildApplication(command, input)
  return Match.value(workerOriginViolated(input)).pipe(
    Match.when(true, () => invalidBody(command.state, workerOriginMessage)),
    Match.when(false, () =>
      Match.value(nameOf(input).length === 0).pipe(
        Match.when(true, () => invalidBody(command.state, dnsNameMessage)),
        Match.when(false, () =>
          Match.value(holdsIdentity(command.state, zone_id, app)).pipe(
            Match.when(true, () => identityTaken(command.state)),
            Match.when(false, () =>
              SpectrumApplied.make({
                body: successEnvelope(app),
                state: Array.append(command.state, { app, zone_id }),
                status: 200,
              })),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
}

const createApp = (command: SpectrumCommand, request: CreateSpectrumApp): SpectrumOutcome =>
  Option.match(Schema.decodeUnknownOption(SpectrumApplicationInput)(request.body), {
    onNone: () => invalidBody(command.state, invalidBodyMessage),
    onSome: (input) => created(command, request.zone_id, input),
  })

const replaced = (
  command: SpectrumCommand,
  zone_id: string,
  stored: StoredSpectrumApplication,
  input: SpectrumApplicationInput,
): SpectrumOutcome => {
  const app: SpectrumApplication = {
    ...buildApplication(command, input),
    created_on: stored.app.created_on,
    id: stored.app.id,
  }
  return Match.value(workerOriginViolated(input)).pipe(
    Match.when(true, () => invalidBody(command.state, workerOriginMessage)),
    Match.when(false, () =>
      Match.value(nameOf(input).length === 0).pipe(
        Match.when(true, () => invalidBody(command.state, dnsNameMessage)),
        Match.when(false, () =>
          SpectrumApplied.make({
            body: successEnvelope(app),
            state: replaceInState(command.state, zone_id, stored.app.id, app),
            status: 200,
          })),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
}

const replaceApp = (command: SpectrumCommand, request: ReplaceSpectrumApp): SpectrumOutcome =>
  Option.match(Schema.decodeUnknownOption(SpectrumApplicationInput)(request.body), {
    onNone: () => invalidBody(command.state, invalidBodyMessage),
    onSome: (input) =>
      Option.match(findApp(command.state, request.zone_id, request.app_id), {
        onNone: () => notFound(command.state),
        onSome: (stored) => replaced(command, request.zone_id, stored, input),
      }),
  })

const getApp = (command: SpectrumCommand, request: GetSpectrumApp): SpectrumOutcome =>
  Option.match(findApp(command.state, request.zone_id, request.app_id), {
    onNone: () => notFound(command.state),
    onSome: (stored) => SpectrumApplied.make({ body: successEnvelope(stored.app), state: command.state, status: 200 }),
  })

const listApps = (command: SpectrumCommand, request: ListSpectrumApps): SpectrumOutcome => {
  const apps = Array.map(Array.filter(command.state, inZone(request.zone_id)), (stored) => stored.app)
  const page = Option.getOrElse(Option.fromUndefinedOr(request.page), () => 1)
  const perPage = Option.getOrElse(Option.fromUndefinedOr(request.per_page), () => apps.length)
  return SpectrumApplied.make({
    body: listEnvelope({ result: apps, info: { page, per_page: perPage, total_count: apps.length } }),
    state: command.state,
    status: 200,
  })
}

const deleteApp = (command: SpectrumCommand, request: DeleteSpectrumApp): SpectrumOutcome =>
  Option.match(findApp(command.state, request.zone_id, request.app_id), {
    onNone: () => notFound(command.state),
    onSome: () =>
      SpectrumApplied.make({
        body: successEnvelope({ id: request.app_id }),
        state: Array.filter(
          command.state,
          (stored) =>
            Array.every(
              [stored.zone_id === request.zone_id, stored.app.id === request.app_id],
              (matches) => matches,
            ) === false,
        ),
        status: 200,
      }),
  })

const decide = (command: SpectrumCommand): Result.Result<SpectrumOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('ListSpectrumApps', (request) => listApps(command, request)),
      Match.tag('CreateSpectrumApp', (request) => createApp(command, request)),
      Match.tag('GetSpectrumApp', (request) => getApp(command, request)),
      Match.tag('ReplaceSpectrumApp', (request) => replaceApp(command, request)),
      Match.tag('DeleteSpectrumApp', (request) => deleteApp(command, request)),
      Match.exhaustive,
    ),
  )

export const spectrumApp = Workflow.make({
  command: SpectrumCommand,
  decision: SpectrumOutcome,
  error: Schema.Never,
  decide,
})
