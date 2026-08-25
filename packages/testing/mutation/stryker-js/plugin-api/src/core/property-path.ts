export type Primitive = boolean | number | string | null | undefined

/**
 * Known keys filters out the index signature from the keys of a type
 * @see https://stackoverflow.com/questions/51465182/typescript-remove-index-signature-using-mapped-types
 */
export type KnownKeys<T> = keyof {
  [P in keyof T as string extends P ? never : number extends P ? never : P]: T[P]
}

type OnlyObject<T> = Exclude<T, Primitive>

export interface PropertyPathOverloads<T> {
  (key: KnownKeys<T>): string
  <TProp1 extends KnownKeys<T>>(
    key: TProp1,
    key2: KnownKeys<OnlyObject<T[TProp1]>>,
  ): string
  <
    TProp1 extends KnownKeys<T>,
    TProp2 extends KnownKeys<OnlyObject<T[TProp1]>>,
  >(
    key: TProp1,
    key2: TProp2,
    key3: KnownKeys<OnlyObject<OnlyObject<T[TProp1]>[TProp2]>>,
  ): string
}

/**
 * Given a base type, allows type safe access to the name of a property.
 * @param prop The property name
 */
export function propertyPath<T>(): PropertyPathOverloads<T> {
  const fn: PropertyPathOverloads<T> = (...args: string[]) => args.join('.')
  return fn
}
