import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settleOperation } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import { GetWorkerSubdomain, WorkerScriptCommand } from '../state/worker-script.schema.js'
import type { WorkerScriptState } from '../state/worker-script.schema.js'
import { workerScript } from '../state/worker-script.workflow.js'

export const workersSubdomainHandlers = HttpApiBuilder.group(CloudflareApi, 'Worker Subdomain', (handlers) =>
  handlers.handle('workerSubdomainGetSubdomain', () =>
    Effect.gen(function*() {
      const store = yield* EmulatorStore
      return yield* settleOperation<WorkerScriptState>({
        store,
        operation: 'workerSubdomainGetSubdomain',
        isWrite: false,
        write: (state, product) => ({ ...state, workerScripts: product }),
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
          return { product: outcome.state, status: outcome.status, body: outcome.body }
        },
      })
    })))
