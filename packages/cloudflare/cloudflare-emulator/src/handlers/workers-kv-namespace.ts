import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import { Match } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import type { Settled } from '../settle-operation.js'
import type { EmulatorState } from '../state/emulator-state.js'
import {
  CreateNamespace,
  GetNamespace,
  KvCommand,
  ListNamespaces,
  RemoveNamespace,
  RenameNamespace,
} from '../state/kv-namespace.schema.js'
import type { KvNamespaceState, KvRequest } from '../state/kv-namespace.schema.js'
import { kvNamespace } from '../state/kv-namespace.workflow.js'
import { entitlementGate } from './entitlement-gate.js'

type KvInput = { readonly now: string; readonly newId: string; readonly state: EmulatorState }

const runKv = (input: KvInput, request: KvRequest): Settled<KvNamespaceState> => {
  const outcome = Result.getOrThrow(
    kvNamespace(KvCommand.make({ now: input.now, newId: input.newId, state: input.state.kvNamespaces, request })),
  )
  return settledOf(outcome)
}

const gatedCreate = (input: KvInput, request: CreateNamespace): Settled<KvNamespaceState> =>
  Match.value(request.mode === 'instant').pipe(
    Match.when(false, () => runKv(input, request)),
    Match.when(true, () =>
      entitlementGate(() => runKv(input, request), {
        product: 'kv-instant',
        state: input.state,
        unchanged: input.state.kvNamespaces,
      })),
    Match.exhaustive,
  )

const applyKv = (
  operation: string,
  isWrite: boolean,
  decide: (input: KvInput) => Settled<KvNamespaceState>,
) =>
  settleOperation({
    slot: 'kvNamespaces',
    operation,
    isWrite,
    decide,
  })

export const workersKvNamespaceHandlers = HttpApiBuilder.group(
  CloudflareApi,
  'Workers KV Namespace',
  (handlers) =>
    handlers
      .handle('workersKvNamespaceListNamespaces', ({ query }) =>
        applyKv(
          'workersKvNamespaceListNamespaces',
          false,
          (input) => runKv(input, ListNamespaces.make({ page: query.page, per_page: query.per_page })),
        ))
      .handle('workersKvNamespaceCreateANamespace', ({ payload }) =>
        applyKv('workersKvNamespaceCreateANamespace', true, (input) =>
          gatedCreate(
            input,
            CreateNamespace.make({ title: payload.title, jurisdiction: payload.jurisdiction, mode: payload.mode }),
          )))
      .handle(
        'workersKvNamespaceGetANamespace',
        ({ params }) =>
          applyKv('workersKvNamespaceGetANamespace', false, (input) =>
            runKv(input, GetNamespace.make({ namespace_id: params.namespace_id }))),
      )
      .handle(
        'workersKvNamespaceRenameANamespace',
        ({ params, payload }) =>
          applyKv('workersKvNamespaceRenameANamespace', true, (input) =>
            runKv(input, RenameNamespace.make({ namespace_id: params.namespace_id, title: payload.title }))),
      )
      .handle(
        'workersKvNamespaceRemoveANamespace',
        ({ params }) =>
          applyKv('workersKvNamespaceRemoveANamespace', true, (input) =>
            runKv(input, RemoveNamespace.make({ namespace_id: params.namespace_id }))),
      ),
)
