/**
 * The dispatch-doctrine gate's command and verdict schemas.
 *
 * Extracted from the executor so `schema-declaration-location` only sees
 * schema declarations in `*.schema.ts` files. The classes stay constructible
 * — the executor instantiates them with `new` — so they are exported as
 * values, and the union carries the same names the executor dispatches on.
 */
import * as S from 'effect/Schema'

const CheckDispatchCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/CheckDispatchCommand',
)

export class CheckDispatchCommand extends S.TaggedClass<CheckDispatchCommand>()('CheckDispatchCommand', {
  toolName: S.String,
  doctrineLoaded: S.Boolean,
  gateEnabled: S.Boolean,
}) {
  readonly [CheckDispatchCommandTypeId] = CheckDispatchCommandTypeId
}

const DispatchDoctrineVerdictTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/DispatchDoctrineVerdict',
)

export class Allow extends S.TaggedClass<Allow>()('Allow', {}) {
  readonly [DispatchDoctrineVerdictTypeId] = DispatchDoctrineVerdictTypeId
}

export class DeliverDoctrine extends S.TaggedClass<DeliverDoctrine>()('DeliverDoctrine', {
  reason: S.String,
}) {
  readonly [DispatchDoctrineVerdictTypeId] = DispatchDoctrineVerdictTypeId
}

export const DispatchDoctrineVerdict = S.Union([Allow, DeliverDoctrine])
export type DispatchDoctrineVerdict = S.Schema.Type<typeof DispatchDoctrineVerdict>
