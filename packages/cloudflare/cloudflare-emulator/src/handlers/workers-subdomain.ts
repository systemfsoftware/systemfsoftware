import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import { GetWorkerSubdomain, WorkerScriptCommand } from '../state/worker-script.schema.js'
import { workerScript } from '../state/worker-script.workflow.js'

export const workersSubdomainHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Worker Subdomain',
  (handlers) =>
    handlers.handle('workerSubdomainGetSubdomain', () =>
      settleOperation({
        slot: 'workerScripts',
        operation: 'workerSubdomainGetSubdomain',
        isWrite: false,
        decide: (input) => {
          const outcome = Result.getOrThrow(
            workerScript(
              WorkerScriptCommand.make({
                now: input.now,
                state: input.state.workerScripts,
                request: GetWorkerSubdomain.make({}),
              }),
            ),
          )
          return settledOf(outcome)
        },
      })),
)
