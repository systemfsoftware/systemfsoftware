type A = string & number | boolean
type B<U extends string = string> = U | null
type C = { [K in keyof B]: B[K] } & { readonly [x: `get${Capitalize<string>}`]: () => void }
type D = typeof import('fs').readFileSync
type E = ReturnType<typeof foo>
type F<T extends string> = T extends `a${infer R}` ? R : never
type G = import('some-pkg', { with: { type: 'json' }}).Data<string>

function foo<T extends string>(x: T): T {
  return x satisfies string
}
const y = 'hi' as const
const z = (x as string) satisfies string
const q: string | undefined = undefined
const r = q!
const s = foo<string>('hi')
const u = import('dynamic-module')

interface IFoo<T> {
  bar<U>(x: T & U): T | U
  [key: string]: unknown
  new<T>(x: T): IFoo<T>
  (x: number): string
}

declare module 'ambient' {
  export const x: number
}

export { foo, q, r, s, u, y, z }
export type { A, B, C, D, E, F, G, IFoo }
