import { type Primitive } from './primitive.js'

type ImmutablePrimitive = Primitive | ((...args: never[]) => unknown)

/**
 * The deeply-readonly view of `T`.
 *
 * The per-container arms are written inline rather than as four exported
 * aliases. Each alias had exactly one use — this type — so exporting them
 * published four names that named no capability and that a consumer could
 * only ever reach through `Immutable` anyway.
 */
export type Immutable<T> = T extends ImmutablePrimitive ? T
  : T extends Array<infer U> ? ReadonlyArray<Immutable<U>>
  : T extends Map<infer K, infer V> ? ReadonlyMap<Immutable<K>, Immutable<V>>
  : T extends Set<infer M> ? ReadonlySet<Immutable<M>>
  : T extends RegExp ? Readonly<RegExp>
  : { readonly [K in keyof T]: Immutable<T[K]> }

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function deepFreeze<T>(target: T): Immutable<T>
export function deepFreeze(target: unknown): unknown {
  switch (typeof target) {
    case 'object':
      if (isUnknownArray(target)) {
        return Object.freeze(target.map(deepFreeze))
      }
      if (target instanceof Map) {
        return Object.freeze(
          new Map(
            [...target.entries()].map(([k, v]) => [
              deepFreeze(k),
              deepFreeze(v),
            ]),
          ),
        )
      }
      if (target instanceof RegExp) {
        return Object.freeze(target)
      }
      if (target === null) {
        return null
      }
      if (target instanceof Set) {
        return Object.freeze(
          new Set([...target.values()].map(deepFreeze)),
        )
      }
      {
        const frozen: Record<string, unknown> = Object.entries(target).reduce<Record<string, unknown>>(
          (result, [prop, val]) => {
            result[prop] = deepFreeze(val)
            return result
          },
          {},
        )
        return Object.freeze(frozen)
      }
    case 'bigint':
    case 'boolean':
    case 'function':
    case 'number':
    case 'string':
    case 'symbol':
    case 'undefined':
      return target
  }
}
