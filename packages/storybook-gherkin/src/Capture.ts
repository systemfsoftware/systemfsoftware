import type { Schema } from 'effect'

export interface Capture<Name extends string = string, _A = unknown> {
  readonly _tag: 'Capture'
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
    _tag: 'Capture',
    name,
    schema: options?.schema,
    default: options?.default,
  }
}
