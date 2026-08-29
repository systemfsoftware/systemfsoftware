// oxlint-disable
// @ts-nocheck
const a = 1 + 2 * 3 - 4 / 2
const b = (a + b) * c
const c2 = a - (b - c)
const d = a ** b ** c
const e = (!a && b) || (c ?? d)
const f = a ? b : c ? d : e
const g = a.b.c[d[e]]
const h = a?.b?.c
const i = a?.[b]
const j = (...args: number[]) => args.reduce((x, y) => x + y, 0)
const k = async (x: number): Promise<number> => await x + 1
const l = function* gen(): Generator<number> {
  yield 1
  yield* [2, 3]
}
const m = class Foo extends Bar implements Baz {
  static x = 1
  #p = 2
  accessor q = 3
}
const n = {
  a,
  b: 2,
  ['computed']: 3,
  ...{ x: 1 },
  get foo() {
    return 1
  },
  set foo(v: number) {},
}
const o = [1, , 3, ...[4, 5]]
const p = `hello ${a} world ${b}`
const q2 = tag`tagged ${a}`
declare function tag(s: TemplateStringsArray, ...args: unknown[]): string
declare class Bar {}
declare interface Baz {}
export { a, b, c2, d, e, f, g, h, i, j, k, l, m, n, o, p, q2 }
