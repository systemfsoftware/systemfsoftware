import { Contract } from '@systemfsoftware/effect-contract'
import type { SurfaceClient } from '@systemfsoftware/effect-contract/testing'
import { Effect, Schema } from 'effect'

const isRefusal = (census: Schema.Json): boolean => Schema.is(Contract.Refused)(census)

const flipRefusal = (census: Schema.Json): Schema.Json =>
  isRefusal(census) ? { _tag: 'Rejected', issue: 'a surface that answers a refusal as a rejection' } : census

export const flipsRefusals = <R>(base: SurfaceClient<R>): SurfaceClient<R> => ({
  call: (name, invocation) => Effect.map(base.call(name, invocation), flipRefusal),
})
