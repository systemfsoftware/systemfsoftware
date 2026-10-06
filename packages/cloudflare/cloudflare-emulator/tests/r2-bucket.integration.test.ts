import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { observed } from './__fixtures__/observed-refusal.fixture.js'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }

const buckets = Effect.map(cloudflare.CloudflareClient, (api) => api['R2 Bucket'])

const createBucket = (payload: {
  readonly name: string
  readonly locationHint?: 'apac' | 'eeur' | 'enam' | 'weur' | 'wnam' | 'oc'
  readonly storageClass?: 'Standard' | 'InfrequentAccess'
}) => Effect.flatMap(buckets, (r2) => r2.r2CreateBucket({ headers: {}, params, payload }))

const createBucketByName = (bucket_name: string, storageClass: 'Standard' | 'InfrequentAccess') =>
  Effect.flatMap(
    buckets,
    (r2) =>
      r2.r2CreateBucketByName({
        params: { account_id: ACCOUNT, bucket_name },
        headers: { 'cf-r2-storage-class': storageClass },
      }),
  )

const listBuckets = (query: {
  readonly name_contains?: string
  readonly start_after?: string
  readonly cursor?: string
  readonly per_page?: number
  readonly direction?: 'asc' | 'desc'
}) => Effect.flatMap(buckets, (r2) => r2.r2ListBuckets({ headers: {}, params, query }))

const listedNames = (listing: { readonly result: { readonly buckets?: ReadonlyArray<{ readonly name?: string }> } }) =>
  (listing.result.buckets ?? []).map((bucket) => bucket.name)

const getBucket = (bucket_name: string) =>
  Effect.flatMap(buckets, (r2) => r2.r2GetBucket({ headers: {}, params: { account_id: ACCOUNT, bucket_name } }))

const patchBucket = (bucket_name: string, storageClass: 'Standard' | 'InfrequentAccess') =>
  Effect.flatMap(
    buckets,
    (r2) =>
      r2.r2PatchBucket({
        params: { account_id: ACCOUNT, bucket_name },
        headers: { 'cf-r2-storage-class': storageClass },
      }),
  )

const deleteBucket = (bucket_name: string) =>
  Effect.flatMap(buckets, (r2) => r2.r2DeleteBucket({ headers: {}, params: { account_id: ACCOUNT, bucket_name } }))

const armRateLimit = (calls: number) =>
  Effect.flatMap(
    Emulator,
    (emulator) =>
      emulator.admin.armInjectedStatus({ operation: 'r2GetBucket', status: 429, retryAfterSeconds: 0, calls }),
  )

const clearFaults = Effect.flatMap(Emulator, (emulator) => emulator.admin.clearFaults)

const emulatorCredentials = Layer.effect(
  Credentials,
  Effect.map(
    Emulator,
    (emulator) => Effect.succeed(apiTokenCredentials({ apiToken: 'emulator', apiBaseUrl: emulator.baseUrl })),
  ),
)

const clientOnEmulator = Layer.mergeAll(
  cloudflare.CloudflareClientLive.pipe(Layer.provide(FetchHttpClient.layer)),
  emulatorCredentials,
).pipe(Layer.provideMerge(emulatorLayer), Layer.provideMerge(NodeServices.layer), Layer.orDie)

Feature('R2 buckets against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A bucket is created by body and by name, and its duplicate names are refused',
      Gherkin.Do.pipe(
        Given('an account with no buckets')('account', () => Effect.succeed(ACCOUNT)),
        When('a bucket named audit is created for the wnam location with the InfrequentAccess class')(
          'created',
          () => createBucket({ locationHint: 'wnam', name: 'audit', storageClass: 'InfrequentAccess' }),
        ),
        Then('the bucket carries the requested class in the default jurisdiction')((s, expect) =>
          expect({
            jurisdiction: s.created.result.jurisdiction,
            name: s.created.result.name,
            storage_class: s.created.result.storage_class,
          }).toEqual({ jurisdiction: 'default', name: 'audit', storage_class: 'InfrequentAccess' })
        ),
        When('the same name is created again')('duplicate', () => observed(createBucket({ name: 'audit' }))),
        Then('the duplicate is refused as already existing')((s, expect) =>
          expect(s.duplicate).toEqual({
            code: 10004,
            kind: 'AlreadyExists',
            message: 'The bucket "audit" already exists.',
            retryAfter: null,
          })
        ),
        When('a bucket named beta is created by name with the Standard class in its header')(
          'byName',
          () => createBucketByName('beta', 'Standard'),
        ),
        Then('the by-name creation stores the bucket with the header class')((s, expect) =>
          expect({ name: s.byName.result.name, storage_class: s.byName.result.storage_class }).toEqual({
            name: 'beta',
            storage_class: 'Standard',
          })
        ),
        When('the bucket name beta is created by name again')(
          'byNameDuplicate',
          () => observed(createBucketByName('beta', 'Standard')),
        ),
        Then('the by-name duplicate is refused as already existing')((s, expect) =>
          expect(s.byNameDuplicate).toEqual({
            code: 10004,
            kind: 'AlreadyExists',
            message: 'The bucket "beta" already exists.',
            retryAfter: null,
          })
        ),
        When('the bucket is read by name')('read', () => getBucket('audit')),
        Then('the read repeats the created bucket')((s, expect) =>
          expect({
            creation_date: s.read.result.creation_date,
            jurisdiction: s.read.result.jurisdiction,
            name: s.read.result.name,
            storage_class: s.read.result.storage_class,
          }).toEqual({
            creation_date: s.created.result.creation_date,
            jurisdiction: s.created.result.jurisdiction,
            name: s.created.result.name,
            storage_class: s.created.result.storage_class,
          })
        ),
        When('a bucket that was never created is read')('missingRead', () => observed(getBucket('missing'))),
        Then('the read is refused as not found')((s, expect) =>
          expect(s.missingRead).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Bucket not found.',
            retryAfter: null,
          })
        ),
        When('the bucket is deleted')('deleted', () => deleteBucket('audit')),
        Then('the delete answers an empty successful result')((s, expect) =>
          expect({ result: s.deleted.result, success: s.deleted.success }).toEqual({ result: {}, success: true })
        ),
        When('the same bucket is deleted again')('reDeleted', () => deleteBucket('audit')),
        Then('the second delete also answers an empty successful result')((s, expect) =>
          expect({ result: s.reDeleted.result, success: s.reDeleted.success }).toEqual({ result: {}, success: true })
        ),
      ),
    )

    scenario(
      'Buckets are listed by name with filters, direction and cursor paging',
      Gherkin.Do.pipe(
        Given('an account holding audit, archive and warehouse buckets')(
          'account',
          () =>
            Effect.gen(function*() {
              yield* createBucket({ name: 'warehouse' })
              yield* createBucket({ name: 'audit', storageClass: 'InfrequentAccess' })
              yield* createBucket({ name: 'archive' })
              return ACCOUNT
            }),
        ),
        When('every bucket is listed')('listed', () => listBuckets({})),
        Then('the buckets are listed by name with the default page size and no cursor')((s, expect) =>
          expect({ names: listedNames(s.listed), result_info: s.listed.result_info }).toEqual({
            names: ['archive', 'audit', 'warehouse'],
            result_info: { per_page: 20 },
          })
        ),
        When('the buckets are listed in descending order')('descending', () => listBuckets({ direction: 'desc' })),
        Then('the names come back reversed')((s, expect) =>
          expect(listedNames(s.descending)).toEqual(['warehouse', 'audit', 'archive'])
        ),
        When('the listing is filtered by part of a bucket name')(
          'filtered',
          () => listBuckets({ name_contains: 'ar' }),
        ),
        Then('only the names containing the fragment are listed')((s, expect) =>
          expect(listedNames(s.filtered)).toEqual(['archive', 'warehouse'])
        ),
        When('the first page of two buckets is listed')('firstPage', () => listBuckets({ per_page: 2 })),
        Then('the page holds the first two names and a cursor after them')((s, expect) =>
          expect({ names: listedNames(s.firstPage), result_info: s.firstPage.result_info }).toEqual({
            names: ['archive', 'audit'],
            result_info: { cursor: 'audit', per_page: 2 },
          })
        ),
        When('the next page is listed with that cursor')(
          'nextPage',
          (s) => listBuckets({ cursor: s.firstPage.result_info?.cursor ?? '', per_page: 2 }),
        ),
        Then('the last page holds the remaining name and no cursor')((s, expect) =>
          expect({ names: listedNames(s.nextPage), result_info: s.nextPage.result_info }).toEqual({
            names: ['warehouse'],
            result_info: { per_page: 2 },
          })
        ),
        When('the buckets after audit are listed')('afterAudit', () => listBuckets({ start_after: 'audit' })),
        Then('only the names after audit are listed')((s, expect) =>
          expect(listedNames(s.afterAudit)).toEqual(['warehouse'])
        ),
        When('a page exactly as large as the account is listed')('exactPage', () => listBuckets({ per_page: 3 })),
        Then('the exact page carries every name and no cursor')((s, expect) =>
          expect({ names: listedNames(s.exactPage), result_info: s.exactPage.result_info }).toEqual({
            names: ['archive', 'audit', 'warehouse'],
            result_info: { per_page: 3 },
          })
        ),
      ),
    )

    scenario(
      'The storage class of a bucket is patched, and a missing bucket is refused',
      Gherkin.Do.pipe(
        Given('an account holding an InfrequentAccess audit bucket')(
          'account',
          () => Effect.as(createBucket({ name: 'audit', storageClass: 'InfrequentAccess' }), ACCOUNT),
        ),
        When('a bucket that was never created is patched')(
          'missingPatch',
          () => observed(patchBucket('missing', 'Standard')),
        ),
        Then('the patch is refused as not found')((s, expect) =>
          expect(s.missingPatch).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Bucket not found.',
            retryAfter: null,
          })
        ),
        When('the audit bucket is patched to the Standard class')(
          'patched',
          () => patchBucket('audit', 'Standard'),
        ),
        Then('the patch reports the new default class')((s, expect) =>
          expect({ name: s.patched.result.name, storage_class: s.patched.result.storage_class }).toEqual({
            name: 'audit',
            storage_class: 'Standard',
          })
        ),
        When('the audit bucket is read again')('read', () => getBucket('audit')),
        Then('the stored bucket carries the patched class')((s, expect) =>
          expect({ name: s.read.result.name, storage_class: s.read.result.storage_class }).toEqual({
            name: 'audit',
            storage_class: 'Standard',
          })
        ),
      ),
    )

    scenario(
      'A rate-limited read is retried by the client and an exhausted retry budget is reported',
      Gherkin.Do.pipe(
        Given('an account holding an audit bucket')(
          'account',
          () =>
            Effect.gen(function*() {
              yield* createBucket({ name: 'audit' })
              return ACCOUNT
            }),
        ),
        When('a 429 fault is armed for one call and the bucket is read')(
          'retried',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(1)
              return yield* getBucket('audit')
            }),
        ),
        Then('the client retries the rate-limited call and the read succeeds')((s, expect) =>
          expect({ name: s.retried.result.name, storage_class: s.retried.result.storage_class }).toEqual({
            name: 'audit',
            storage_class: 'Standard',
          })
        ),
        When('a 429 fault is armed for every attempt and the bucket is read again')(
          'rateLimited',
          () =>
            Effect.gen(function*() {
              yield* armRateLimit(3)
              return yield* observed(getBucket('audit'))
            }),
        ),
        Then('the read fails as rate limited with the injected retry-after')((s, expect) =>
          expect(s.rateLimited).toEqual({
            code: 429,
            kind: 'RateLimited',
            message: 'Injected 429 fault.',
            retryAfter: 0,
          })
        ),
        When('the faults are cleared and the bucket is read once more')(
          'finalRead',
          () =>
            Effect.gen(function*() {
              yield* clearFaults
              return yield* getBucket('audit')
            }),
        ),
        Then('the read is answered again')((s, expect) =>
          expect({ name: s.finalRead.result.name, storage_class: s.finalRead.result.storage_class }).toEqual({
            name: 'audit',
            storage_class: 'Standard',
          })
        ),
      ),
    )
  })
