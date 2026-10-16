import type { Schema } from 'effect'
import { dual } from 'effect/Function'

const CaptureTag = { _tag: 'Capture' } as const
export type CaptureTag = typeof CaptureTag

type AnyConstraintDecoder<A = unknown> = Schema.ConstraintDecoder<A>

export interface Capture<Name extends string = string, _A = unknown> extends CaptureTag {
  readonly name: Name
  readonly schema: AnyConstraintDecoder | undefined
  readonly default: string | undefined
}

function captureImpl<Name extends string, A>(
  name: Name,
  options?: { readonly schema?: Schema.Codec<A, string>; readonly default?: string },
): Capture<Name, A> {
  const resolved = options ?? {}
  return {
    ...CaptureTag,
    name,
    schema: resolved.schema,
    default: resolved.default,
  }
}

export const capture: {
  <Name extends string, A>(options: {
    readonly schema: Schema.Codec<A, string>
    readonly default?: string
  }): (name: Name) => Capture<Name, A>
  <Name extends string>(options?: { readonly default?: string }): (name: Name) => Capture<Name, string>
  <Name extends string, A>(name: Name, options: {
    readonly schema: Schema.Codec<A, string>
    readonly default?: string
  }): Capture<Name, A>
  <Name extends string>(name: Name, options?: { readonly default?: string }): Capture<Name, string>
} = dual(
  (args: IArguments) => typeof args[0] === 'string',
  captureImpl,
)
