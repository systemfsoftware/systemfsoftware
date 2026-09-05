import type { Schema } from 'effect'

const CaptureTag = { _tag: 'Capture' } as const
export type CaptureTag = typeof CaptureTag

export interface Capture<Name extends string = string, _A = unknown> extends CaptureTag {
  readonly name: Name
  readonly schema: Schema.ConstraintDecoder<unknown> | undefined
  readonly default: string | undefined
}

export function capture<Name extends string, A>(
  name: Name,
  options: { readonly schema: Schema.Codec<A, string>; readonly default?: string },
): Capture<Name, A>
export function capture<Name extends string>(
  name: Name,
  options?: { readonly default?: string },
): Capture<Name, string>
export function capture<Name extends string, A>(
  name: Name,
  options?: { readonly schema?: Schema.Codec<A, string>; readonly default?: string },
): Capture<Name, A> {
  return {
    ...CaptureTag,
    name,
    schema: options?.schema,
    default: options?.default,
  }
}
