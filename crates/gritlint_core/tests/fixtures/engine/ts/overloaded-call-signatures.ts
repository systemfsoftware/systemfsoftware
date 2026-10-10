export const f: {
  (n: number): boolean
  <A>(value: A): A
} = dual(2, (n, value) => value)
