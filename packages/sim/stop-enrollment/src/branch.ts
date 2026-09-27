export interface Branch<A> {
  readonly on: boolean
  readonly yes: () => A
  readonly no: () => A
}

export const branch = <A>(one: Branch<A>): A => (one.on ? one.yes() : one.no())

export const anyOf = (values: readonly boolean[]): boolean => values.some((value) => value)

export const allOf = (values: readonly boolean[]): boolean => values.every((value) => value)
