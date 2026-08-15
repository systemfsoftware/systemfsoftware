/**
 * `src/brands.kernel.ts`, as a term.
 *
 * Three type-id brands, each a `unique symbol` const paired with a `typeof` alias. The pattern is
 * inert by construction — a registry key and a name for its type — so the whole cell is declaration
 * with nothing to compute, and the `Symbol.for` call is admissible in a role that requires nothing
 * because its result is a function of its key alone.
 *
 * `unique symbol` is an annotation the emitter writes rather than a type it constructs: TypeScript
 * only accepts it on a `const`, and only where the initializer is a direct `Symbol()` or
 * `Symbol.for()` call, so the annotation and the initializer are one fact stated twice.
 */
import { callBroken, kernel, lit } from '../../../scripts/tools/cell.ts'

/** The three brands, each `Symbol.for` of a package-qualified key. */
const BRANDS: readonly (readonly [name: string, key: string])[] = [
  ['WorkerTypeId', '@systemfsoftware/effect-daemon/Worker'],
  ['SupervisorTypeId', '@systemfsoftware/effect-daemon/Supervisor'],
  ['DynamicSpecTypeId', '@systemfsoftware/effect-daemon/DynamicSpec'],
]

const program = kernel({
  imports: [],
  // Each brand is one fact stated twice — a registry key and a name for its type — so the alias sits
  // tight under the const it names, and the pairs are separated from each other.
  declarations: BRANDS.flatMap(([name, key]) => [
    { name, term: callBroken('Symbol.for', lit(key)), annotation: { uniqueSymbol: true } },
    { kind: 'type' as const, name, value: { typeOf: name }, blankBefore: false },
  ]),
})

export default program
