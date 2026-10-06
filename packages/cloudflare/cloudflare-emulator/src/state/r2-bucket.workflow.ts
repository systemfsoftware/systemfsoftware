import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Order, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, presentField, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  DeleteBucket,
  GetBucket,
  ListBuckets,
  PatchBucket,
  R2Applied,
  R2Bucket,
  R2BucketState,
  R2Command,
  R2Outcome,
  R2Refused,
} from './r2-bucket.schema.js'

const notFound = (state: R2BucketState): R2Refused =>
  R2Refused.make({ state, status: 404, body: failureEnvelope({ code: 10006, message: 'Bucket not found.' }) })

const conflict = (state: R2BucketState, name: string): R2Refused =>
  R2Refused.make({
    state,
    status: 409,
    body: failureEnvelope({ code: 10004, message: `The bucket "${name}" already exists.` }),
  })

const bucketExists = (state: R2BucketState, name: string): boolean =>
  Array.contains(Array.map(state, (bucket) => bucket.name), name)

const defaultStorageClass = (storageClass: R2Bucket['storage_class'] | undefined): R2Bucket['storage_class'] =>
  Option.getOrElse(Option.fromUndefinedOr(storageClass), () => 'Standard')

const buildBucket = (
  command: R2Command,
  name: string,
  storageClass: R2Bucket['storage_class'] | undefined,
): R2Bucket => ({
  creation_date: command.now,
  jurisdiction: 'default',
  name,
  storage_class: defaultStorageClass(storageClass),
})

const createdBucket = (
  command: R2Command,
  name: string,
  storageClass: R2Bucket['storage_class'] | undefined,
): R2Outcome => {
  const bucket = buildBucket(command, name, storageClass)
  return Match.value(bucketExists(command.state, name)).pipe(
    Match.when(true, () => conflict(command.state, name)),
    Match.when(
      false,
      () => R2Applied.make({ state: Array.append(command.state, bucket), status: 200, body: successEnvelope(bucket) }),
    ),
    Match.exhaustive,
  )
}

const matchesName = (contains: string | undefined) => (bucket: R2Bucket): boolean =>
  Option.match(Option.fromUndefinedOr(contains), {
    onNone: () => true,
    onSome: (fragment) => bucket.name.includes(fragment),
  })

// openapi/slice.json r2-list-buckets: buckets are ordered lexicographically by name,
// `per_page` defaults to 20, and `start_after` or a returned `cursor` marks where a page begins.
const DEFAULT_PER_PAGE = 20

const nameOrder = (direction: ListBuckets['direction']): Order.Order<string> =>
  Match.value(direction).pipe(
    Match.when('desc', () => Order.flip(Order.String)),
    Match.when('asc', () => Order.String),
    Match.when(undefined, () => Order.String),
    Match.exhaustive,
  )

const listBuckets = (command: R2Command, request: ListBuckets): R2Outcome => {
  const order = nameOrder(request.direction)
  const matching = Array.sort(
    Array.filter(command.state, matchesName(request.name_contains)),
    Order.mapInput(order, (bucket: R2Bucket) => bucket.name),
  )
  const marker = Option.orElse(
    Option.fromUndefinedOr(request.cursor),
    () => Option.fromUndefinedOr(request.start_after),
  )
  const remaining = Option.match(marker, {
    onNone: () => matching,
    onSome: (after) => Array.filter(matching, (bucket) => order(bucket.name, after) > 0),
  })
  const perPage = Option.getOrElse(Option.fromUndefinedOr(request.per_page), () => DEFAULT_PER_PAGE)
  const page = Array.take(remaining, perPage)
  const cursor = Array.last(page).pipe(
    Option.filter(() => remaining.length > perPage),
    Option.map((last) => last.name),
    Option.getOrUndefined,
  )
  return R2Applied.make({
    state: command.state,
    status: 200,
    body: {
      ...successEnvelope({ buckets: page }),
      result_info: { per_page: perPage, ...presentField(cursor, 'cursor') },
    },
  })
}

const findBucket = (state: R2BucketState, name: string): Option.Option<R2Bucket> =>
  Array.findFirst(state, (bucket) => bucket.name === name)

const getBucket = (command: R2Command, request: GetBucket): R2Outcome =>
  Option.match(findBucket(command.state, request.bucket_name), {
    onNone: () => notFound(command.state),
    onSome: (bucket) => R2Applied.make({ state: command.state, status: 200, body: successEnvelope(bucket) }),
  })

const deleteBucket = (command: R2Command, request: DeleteBucket): R2Outcome => {
  const state = Array.filter(command.state, (bucket) => bucket.name !== request.bucket_name)
  return R2Applied.make({ state, status: 200, body: successEnvelope({}) })
}

const patchBucket = (command: R2Command, request: PatchBucket): R2Outcome =>
  Option.match(findBucket(command.state, request.bucket_name), {
    onNone: () => notFound(command.state),
    onSome: (bucket) =>
      R2Applied.make({
        state: applyStorageClass(command.state, bucket, request),
        status: 200,
        body: successEnvelope({ ...bucket, storage_class: request.storage_class }),
      }),
  })

const applyStorageClass = (state: R2BucketState, bucket: R2Bucket, request: PatchBucket): R2BucketState =>
  Array.map(state, (candidate) =>
    Match.value(candidate.name === bucket.name).pipe(
      Match.when(true, () => ({ ...candidate, storage_class: request.storage_class })),
      Match.when(false, () => candidate),
      Match.exhaustive,
    ))

const decide = (command: R2Command): Result.Result<R2Outcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('CreateBucket', (request) => createdBucket(command, request.name, request.storage_class)),
      Match.tag('ListBuckets', (request) => listBuckets(command, request)),
      Match.tag('GetBucket', (request) => getBucket(command, request)),
      Match.tag('CreateBucketByName', (request) => createdBucket(command, request.bucket_name, request.storage_class)),
      Match.tag('DeleteBucket', (request) => deleteBucket(command, request)),
      Match.tag('PatchBucket', (request) => patchBucket(command, request)),
      Match.exhaustive,
    ),
  )

export const r2Bucket = Workflow.make({
  command: R2Command,
  decision: R2Outcome,
  error: Schema.Never,
  decide,
})
