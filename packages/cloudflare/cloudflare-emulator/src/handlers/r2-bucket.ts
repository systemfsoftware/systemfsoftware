import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settleOperation } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import {
  CreateBucket,
  CreateBucketByName,
  DeleteBucket,
  GetBucket,
  ListBuckets,
  PatchBucket,
  R2Command,
} from '../state/r2-bucket.schema.js'
import type { R2BucketState, R2Request } from '../state/r2-bucket.schema.js'
import { r2Bucket } from '../state/r2-bucket.workflow.js'

const applyR2 = (operation: string, isWrite: boolean, request: R2Request) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<R2BucketState>({
      store,
      operation,
      isWrite,
      write: (state, product) => ({ ...state, r2Buckets: product }),
      decide: (input) => {
        const outcome = Result.getOrThrow(
          r2Bucket(R2Command.make({ now: input.now, newId: input.newId, state: input.state.r2Buckets, request })),
        )
        return { product: outcome.state, status: outcome.status, body: outcome.body }
      },
    })
  })

export const r2BucketHandlers = HttpApiBuilder.group(CloudflareApi, 'R2 Bucket', (handlers) =>
  handlers
    .handle('r2ListBuckets', ({ query }) =>
      applyR2(
        'r2ListBuckets',
        false,
        ListBuckets.make({
          name_contains: query.name_contains,
          start_after: query.start_after,
          per_page: query.per_page,
        }),
      ))
    .handle('r2CreateBucket', ({ payload }) =>
      applyR2(
        'r2CreateBucket',
        true,
        CreateBucket.make({ name: payload.name, location: payload.locationHint, storage_class: payload.storageClass }),
      ))
    .handle('r2GetBucket', ({ params }) =>
      applyR2('r2GetBucket', false, GetBucket.make({ bucket_name: params.bucket_name })))
    .handle('r2CreateBucketByName', ({ params, headers }) =>
      applyR2(
        'r2CreateBucketByName',
        true,
        CreateBucketByName.make({ bucket_name: params.bucket_name, storage_class: headers['cf-r2-storage-class'] }),
      ))
    .handle('r2DeleteBucket', ({ params }) =>
      applyR2('r2DeleteBucket', true, DeleteBucket.make({ bucket_name: params.bucket_name })))
    .handle('r2PatchBucket', ({ params, headers }) =>
      applyR2(
        'r2PatchBucket',
        true,
        PatchBucket.make({ bucket_name: params.bucket_name, storage_class: headers['cf-r2-storage-class'] }),
      )))
