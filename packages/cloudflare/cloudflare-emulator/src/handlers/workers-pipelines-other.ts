import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import {
  CreateSink,
  CreateSinkWithoutBody,
  DeleteSink,
  GetSink,
  ListSinks,
  PipelinesCommand,
} from '../state/pipelines-sink.schema.js'
import type { PipelinesRequest } from '../state/pipelines-sink.schema.js'
import { pipelinesSink } from '../state/pipelines-sink.workflow.js'

const applyPipelines = (operation: string, isWrite: boolean, request: PipelinesRequest) =>
  settleOperation({
    slot: 'pipelinesSinks',
    operation,
    isWrite,
    decide: (input) => {
      const outcome = Result.getOrThrow(
        pipelinesSink(
          PipelinesCommand.make({ now: input.now, newId: input.newId, state: input.state.pipelinesSinks, request }),
        ),
      )
      return settledOf(outcome)
    },
  })

export const workersPipelinesOtherHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'workers_pipelines_other',
  (handlers) =>
    handlers
      .handle('getV4AccountsByAccountIdPipelinesV1Sinks', ({ query }) =>
        applyPipelines(
          'getV4AccountsByAccountIdPipelinesV1Sinks',
          false,
          ListSinks.make({ name: query.name, page: query.page, per_page: query.per_page }),
        ))
      .handle('postV4AccountsByAccountIdPipelinesV1Sinks', ({ payload }) =>
        applyPipelines(
          'postV4AccountsByAccountIdPipelinesV1Sinks',
          true,
          payload === undefined
            ? CreateSinkWithoutBody.make({})
            : CreateSink.make({ name: payload.name, type: payload.type }),
        ))
      .handle('getV4AccountsByAccountIdPipelinesV1SinksBySinkId', ({ params }) =>
        applyPipelines(
          'getV4AccountsByAccountIdPipelinesV1SinksBySinkId',
          false,
          GetSink.make({ sink_id: params.sink_id }),
        ))
      .handle('deleteV4AccountsByAccountIdPipelinesV1SinksBySinkId', ({ params }) =>
        applyPipelines(
          'deleteV4AccountsByAccountIdPipelinesV1SinksBySinkId',
          true,
          DeleteSink.make({ sink_id: params.sink_id }),
        )),
)
