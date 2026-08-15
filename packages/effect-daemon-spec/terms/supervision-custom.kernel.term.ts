/**
 * `src/supervision-custom.kernel.ts`, as a term.
 *
 * The smallest cell in the tree, and the one that named the language's last gap: a generic parameter
 * on the function a declaration binds. `Effect.succeed` lifts a value without running anything, so
 * the term requires nothing and `kernel` admits it — the import states as much.
 */
import { call, kernel, lam, nothing } from '../../../scripts/tools/cell.ts'
import { t } from '../../../scripts/tools/term.ts'

const program = kernel({
  imports: [{ module: 'effect', values: ['Effect'], requires: nothing }],
  declarations: [
    {
      name: 'custom',
      term: lam(
        [['policy', t.ref('P')]],
        (policy) => call('Effect.succeed', policy),
        { typeParams: [{ name: 'P' }], returns: t.generic('Effect.Effect', t.ref('P')) },
      ),
    },
  ],
})

export default program
