import { Effect, Option, Redacted, Schema } from 'effect'
import type * as HttpBody from 'effect/http/HttpBody'
import * as HttpClient from 'effect/http/HttpClient'
import type * as HttpClientError from 'effect/http/HttpClientError'
import { ResourceLeak } from '../capture-errors.schema.js'
import type { RawValue } from '../captured-response.schema.js'
import type { CaseVariables, HttpExchange } from '../case-catalogue.js'
import { atPath } from '../json-path.js'
import { leaks, type ResourceListing } from '../leak-check.js'
import { send } from './http.js'

type TransportError = HttpClientError.HttpClientError | HttpBody.HttpBodyError

/** The origin, credential, and run variables a listing is built from. */
export interface ListResourcesOf {
  readonly baseUrl: string
  readonly token: Redacted.Redacted<string>
  readonly variables: CaseVariables
}

interface ListingSpec {
  readonly kind: string
  readonly exchange: (variables: CaseVariables) => HttpExchange
  readonly itemsPath: ReadonlyArray<string>
  readonly namePath: ReadonlyArray<string>
}

const account = ({ accountId }: CaseVariables): string => `/accounts/${accountId}`
const zone = ({ zoneId }: CaseVariables): string => `/zones/${zoneId}`

/** Every resource kind the run can create, and how to list each one. */
const LISTINGS: ReadonlyArray<ListingSpec> = [
  {
    kind: 'k2Stream',
    itemsPath: ['result'],
    namePath: ['name'],
    exchange: (variables) => ({ method: 'GET', path: `${account(variables)}/k2/streams` }),
  },
  {
    kind: 'kvNamespace',
    itemsPath: ['result'],
    namePath: ['title'],
    exchange: (variables) => ({ method: 'GET', path: `${account(variables)}/storage/kv/namespaces` }),
  },
  {
    kind: 'r2Bucket',
    itemsPath: ['result', 'buckets'],
    namePath: ['name'],
    exchange: (variables) => ({ method: 'GET', path: `${account(variables)}/r2/buckets` }),
  },
  {
    kind: 'basinCatalog',
    itemsPath: ['result'],
    namePath: ['bucket_name'],
    exchange: (variables) => ({ method: 'GET', path: `${account(variables)}/basin-catalog` }),
  },
  {
    kind: 'spectrumApp',
    itemsPath: ['result'],
    namePath: ['dns', 'name'],
    exchange: (variables) => ({ method: 'GET', path: `${zone(variables)}/spectrum/apps` }),
  },
  {
    kind: 'paymentRule',
    itemsPath: ['result', 'rules'],
    namePath: ['description'],
    exchange: (variables) => ({ method: 'GET', path: `${zone(variables)}/monetization/rules` }),
  },
  {
    kind: 'destination',
    itemsPath: ['result'],
    namePath: ['slug'],
    exchange: (variables) => ({
      method: 'GET',
      path: `${account(variables)}/workers/observability/destinations`,
    }),
  },
  {
    kind: 'issuesAutomation',
    itemsPath: ['result'],
    namePath: ['name'],
    exchange: (variables) => ({
      method: 'GET',
      path: `${account(variables)}/workers/observability/issues/automations`,
    }),
  },
]

const namesOf = (body: Option.Option<RawValue>, spec: ListingSpec): ReadonlyArray<string> =>
  Option.getOrElse(
    Option.flatMap(
      Option.flatMap(body, (value) => atPath({ value, path: spec.itemsPath })),
      (items) => Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(items),
    ),
    () => [],
  ).flatMap((item) =>
    Option.match(atPath({ value: item, path: spec.namePath }), {
      onNone: () => [],
      onSome: (name) => [String(name)],
    })
  )

/** Lists every resource kind the run can create, reading each name it holds. */
export const listResources = (
  { baseUrl, token, variables }: ListResourcesOf,
): Effect.Effect<ReadonlyArray<ResourceListing>, TransportError, HttpClient.HttpClient> =>
  Effect.forEach(
    LISTINGS,
    (spec) =>
      Effect.map(send({ baseUrl, token, exchange: spec.exchange(variables) }), (response) => ({
        kind: spec.kind,
        names: namesOf(response.body, spec),
      })),
  )

/**
 * The run's post-condition: after every scope closed, no listed resource still
 * carries the run prefix. An existing resource the run never touched carries
 * none, so it is never reported.
 */
export const assertNoLeaks = (
  { baseUrl, token, variables }: ListResourcesOf,
): Effect.Effect<void, TransportError | ResourceLeak, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const listings = yield* listResources({ baseUrl, token, variables })
    const found = leaks({ prefix: variables.runPrefix, listings })
    return yield* found.length > 0
      ? Effect.fail(
        new ResourceLeak({
          message: `the run left ${found.length} resource(s) named with its prefix behind`,
          names: found.map(({ kind, name }) => `${kind}:${name}`),
        }),
      )
      : Effect.void
  })
