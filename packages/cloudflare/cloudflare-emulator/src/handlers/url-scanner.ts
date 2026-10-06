import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settleOperation } from '../settle-operation.js'
import { EmulatorStore } from '../state/emulator-store.js'
import { CreateScan, CreateScanWithoutBody, GetScan, SearchScans, UrlScanCommand } from '../state/url-scan.schema.js'
import type { UrlScanRequest, UrlScanState } from '../state/url-scan.schema.js'
import { urlScan } from '../state/url-scan.workflow.js'

const applyScan = (operation: string, isWrite: boolean, request: UrlScanRequest) =>
  Effect.gen(function*() {
    const store = yield* EmulatorStore
    return yield* settleOperation<UrlScanState>({
      store,
      operation,
      isWrite,
      write: (state, product) => ({ ...state, urlScans: product }),
      decide: (input) => {
        const outcome = Result.getOrThrow(
          urlScan(UrlScanCommand.make({ now: input.now, newId: input.newId, state: input.state.urlScans, request })),
        )
        return { product: outcome.state, status: outcome.status, body: outcome.body }
      },
    })
  })

export const urlScannerHandlers = HttpApiBuilder.group(CloudflareApi, 'URL Scanner', (handlers) =>
  handlers
    .handle('urlscannerCreateScanV2', ({ params, payload }) =>
      applyScan(
        'urlscannerCreateScanV2',
        true,
        payload === undefined
          ? CreateScanWithoutBody.make({})
          : CreateScan.make({
            account_id: params.account_id,
            agentReadiness: payload.agentReadiness,
            customagent: payload.customagent,
            url: payload.url,
            visibility: payload.visibility,
          }),
      ))
    .handle('urlscannerGetScanV2', ({ params }) =>
      applyScan(
        'urlscannerGetScanV2',
        false,
        GetScan.make({ account_id: params.account_id, scan_id: params.scan_id }),
      ))
    .handle('urlscannerSearchScansV2', ({ params, query }) =>
      applyScan(
        'urlscannerSearchScansV2',
        false,
        SearchScans.make({ account_id: params.account_id, q: query.q, size: query.size }),
      )))
