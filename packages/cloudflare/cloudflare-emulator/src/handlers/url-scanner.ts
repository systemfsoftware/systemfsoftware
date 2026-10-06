import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import { CreateScan, GetScan, SearchScans, UrlScanCommand } from '../state/url-scan.schema.js'
import type { UrlScanRequest } from '../state/url-scan.schema.js'
import { urlScan } from '../state/url-scan.workflow.js'

const applyScan = (operation: string, isWrite: boolean, request: UrlScanRequest) =>
  settleOperation({
    slot: 'urlScans',
    operation,
    isWrite,
    decide: (input) => {
      const outcome = Result.getOrThrow(
        urlScan(UrlScanCommand.make({ now: input.now, newId: input.newId, state: input.state.urlScans, request })),
      )
      return settledOf(outcome)
    },
  })

export const urlScannerHandlers = HttpApiBuilder.group(CloudflareApi, 'URL Scanner', (handlers) =>
  handlers
    .handle('urlscannerCreateScanV2', ({ params, payload }) =>
      applyScan(
        'urlscannerCreateScanV2',
        true,
        CreateScan.make({
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
