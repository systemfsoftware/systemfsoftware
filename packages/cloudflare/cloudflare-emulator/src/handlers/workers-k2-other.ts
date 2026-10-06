// Follow-up groups: add a handler file here and one entry to HANDLER_LAYERS in ../server.js.

import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import {
  CreateK2Stream,
  DeleteK2Stream,
  GetK2Stream,
  K2Command,
  ListK2Streams,
  ListK2Subscriptions,
  PatchK2Stream,
} from '../state/k2-stream.schema.js'
import type { K2Request } from '../state/k2-stream.schema.js'
import { k2Stream } from '../state/k2-stream.workflow.js'

const applyK2 = (operation: string, isWrite: boolean, request: K2Request) =>
  settleOperation({
    slot: 'k2Streams',
    operation,
    isWrite,
    decide: (input) => {
      const outcome = Result.getOrThrow(
        k2Stream(K2Command.make({ now: input.now, newId: input.newId, state: input.state.k2Streams, request })),
      )
      return settledOf(outcome)
    },
  })

export const workersK2OtherHandlers = HttpApiBuilder.group(CloudflareApi, 'workers_k2_other', (handlers) =>
  handlers
    .handle('getV4AccountsByAccountIdK2Streams', ({ query }) =>
      applyK2(
        'getV4AccountsByAccountIdK2Streams',
        false,
        ListK2Streams.make({ name: query.name, page: query.page, per_page: query.per_page }),
      ))
    .handle('postV4AccountsByAccountIdK2Streams', ({ payload }) =>
      applyK2(
        'postV4AccountsByAccountIdK2Streams',
        true,
        CreateK2Stream.make({
          name: payload.name,
          http: payload.http,
          retention_seconds: payload.retention_seconds,
          worker_binding: payload.worker_binding,
        }),
      ))
    .handle('getV4AccountsByAccountIdK2StreamsByStreamId', ({ params }) =>
      applyK2('getV4AccountsByAccountIdK2StreamsByStreamId', false, GetK2Stream.make({ stream_id: params.stream_id })))
    .handle('deleteV4AccountsByAccountIdK2StreamsByStreamId', ({ params }) =>
      applyK2(
        'deleteV4AccountsByAccountIdK2StreamsByStreamId',
        true,
        DeleteK2Stream.make({ stream_id: params.stream_id }),
      ))
    .handle('patchV4AccountsByAccountIdK2StreamsByStreamId', ({ params, payload }) =>
      applyK2(
        'patchV4AccountsByAccountIdK2StreamsByStreamId',
        true,
        PatchK2Stream.make({
          stream_id: params.stream_id,
          http: payload.http,
          retention_seconds: payload.retention_seconds,
          worker_binding: payload.worker_binding,
        }),
      ))
    .handle('getV4AccountsByAccountIdK2StreamsByStreamIdSubscriptions', ({ params }) =>
      applyK2(
        'getV4AccountsByAccountIdK2StreamsByStreamIdSubscriptions',
        false,
        ListK2Subscriptions.make({ stream_id: params.stream_id }),
      )))
