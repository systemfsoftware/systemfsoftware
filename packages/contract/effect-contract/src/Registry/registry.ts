import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { DurableWrite } from '../Contract/access.schema.js'
import type { Capability, Invocation } from '../Contract/contract.js'
import {
  CheckOperationVisibility,
  checkOperationVisibility,
} from '../Operations/check-operation-visibility.workflow.js'
import { getOperation } from '../Operations/get-operation.contract.js'
import { OperationNotFound, type OperationState } from '../Operations/operation-state.schema.js'
import type { OperationId } from '../Operations/operation.schema.js'
import { Operations } from '../Operations/operations.service.js'
import type { Principal } from '../Principal/principal.schema.js'

export interface KeyNamesAnotherContract<Key extends string, Name extends string> {
  readonly __CONTRACT_REGISTRY_KEY_MUST_EQUAL_THE_CONTRACT_NAME__: `key '${Key}' holds contract '${Name}'`
}

export interface LinkNamesNoCapability<Link extends string> {
  readonly __CONTRACT_LINK_NAMES_NO_REGISTERED_CAPABILITY__: `link '${Link}' names no capability in this registry`
}

export type Capabilities = { readonly [name: string]: Capability }

type UnregisteredLinks<R extends Capabilities, K extends keyof R> = Exclude<
  R[K]['contract']['links'][number],
  keyof R
>

export type Checked<R extends Capabilities> = {
  readonly [K in keyof R & string]: [K] extends [R[K]['contract']['name']]
    ? [UnregisteredLinks<R, K>] extends [never] ? R[K] : LinkNamesNoCapability<UnregisteredLinks<R, K>>
    : KeyNamesAnotherContract<K, R[K]['contract']['name']>
}

type GetOperation = typeof getOperation
type GetOperationAnswer = GetOperation['answer']['Type']
type GetOperationCapability = Capability<GetOperation, Operations>

const completed = (output: OperationState): GetOperationAnswer => ({ _tag: 'Completed', output, next: [] })

const refused = (refusal: OperationNotFound): GetOperationAnswer => ({ _tag: 'Refused', refusal, next: [] })

const rejected = (issue: string): GetOperationAnswer => ({ _tag: 'Rejected', issue })

/** A Person-owned operation answers its owner alone; an Anonymous-owned one is readable by its id. */
const answerFor = (id: OperationId, state: OperationState, principal: Principal): GetOperationAnswer =>
  Match.value(state).pipe(
    Match.tag(
      'Pending',
      (pending) =>
        Result.match(checkOperationVisibility(new CheckOperationVisibility({ owner: pending.owner, principal })), {
          onFailure: () => completed(state),
          onSuccess: (visibility) =>
            Match.value(visibility).pipe(
              Match.tag('OperationVisible', () => completed(state)),
              Match.tag('OperationHidden', () => refused(new OperationNotFound({ id }))),
              Match.exhaustive,
            ),
        }),
    ),
    Match.tag('Settled', () => completed(state)),
    Match.exhaustive,
  )

const lookup = (invocation: Invocation): Effect.Effect<GetOperationAnswer, never, Operations> =>
  Effect.gen(function*() {
    const decoded = Schema.decodeUnknownResult(getOperation.input)(invocation.input)
    return yield* Result.match(decoded, {
      onFailure: (error) => Effect.succeed(rejected(error.message)),
      onSuccess: ({ operation }) =>
        Effect.gen(function*() {
          const operations = yield* Operations
          return yield* Effect.match(operations.get(operation), {
            onFailure: (notFound) => refused(notFound),
            onSuccess: (state) => answerFor(operation, state, invocation.principal),
          })
        }),
    })
  })

const getOperationCell: Cell.Cell<Invocation, GetOperationAnswer, never, Operations> = Cell.flatMap(
  Cell.id<Invocation>(),
  (invocation) => Cell.fromEffect(lookup(invocation)),
)

const getOperationCapability: GetOperationCapability = { contract: getOperation, cell: getOperationCell }

export type HasDurable<R extends Capabilities> = true extends {
  readonly [K in keyof R]: R[K]['contract']['access'] extends DurableWrite ? true : never
}[keyof R] ? true
  : false

export type Registry<R extends Capabilities> =
  & R
  & (
    HasDurable<R> extends true ? { readonly getOperation: GetOperationCapability } : {}
  )

const isDurable = (capability: Capability): boolean => Schema.is(DurableWrite)(capability.contract.access)

const hasDurable = (capabilities: Capabilities): boolean => Object.values(capabilities).some(isDurable)

export function make<const R extends Capabilities>(capabilities: R & Checked<R>): Registry<R>
export function make(
  capabilities: Capabilities,
): Capabilities | ({ readonly [name: string]: Capability | GetOperationCapability }) {
  return hasDurable(capabilities) ? { ...capabilities, getOperation: getOperationCapability } : capabilities
}
