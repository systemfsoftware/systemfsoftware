/**
 * `src/run-safe.kernel.ts`, as a term.
 *
 * A cell whose entire content is two type aliases, which is the cleanest case for the claim that a
 * type is declarable where a body is not: nothing here computes, so there is no function body for a
 * declaration to fail to express. It compiles from data end to end.
 *
 * Both aliases needed something the language did not have. `RunSafe` is a *generic* function type,
 * so a type-parameter list had to reach a function type rather than only an interface or an alias.
 * `RuntimeContext` reads a type off a default-exported object, which needs the default import form —
 * a namespace import binds the module object instead of the one exported value, and the two resolve
 * differently, so it is a distinct form rather than a spelling of the same one.
 */
import { kernel, nothing } from '../../../../scripts/tools/cell.ts'
import { t } from '../../../../scripts/tools/term.ts'

const program = kernel({
  imports: [
    { module: 'effect', types: ['Effect'], typeOnly: true, requires: nothing },
    { module: './runtime.kernel.js', default: 'runtime', typeOnly: true, requires: nothing },
  ],
  declarations: [
    {
      kind: 'type',
      name: 'RuntimeContext',
      value: t.generic(
        'Effect.Effect.Context',
        { indexed: { of: t.generic('Parameters', { typeOf: 'runtime.runPromise' }), index: 0 } },
      ),
    },
    {
      kind: 'type',
      name: 'RunSafe',
      value: {
        fn: {
          typeParams: [{ name: 'A' }, { name: 'E' }],
          params: [{
            name: 'effect',
            type: t.generic('Effect.Effect', t.ref('A'), t.ref('E'), t.ref('RuntimeContext')),
          }],
          returns: t.generic('Promise', t.ref('A')),
        },
      },
    },
  ],
})

export default program
