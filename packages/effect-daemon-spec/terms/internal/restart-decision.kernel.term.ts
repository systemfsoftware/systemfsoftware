/**
 * `src/internal/restart-decision.kernel.ts`, as a kernel-typed term.
 *
 * The role is the constructor, not the filename. `kernel` is `role<never, 'term' | 'type'>` — it
 * admits declarations whose terms require nothing, so this file could not have named a clock,
 * imported something impure, or constructed an Effect even by accident. The four kernel rules the
 * repository enforces with walkers are consequences of that signature.
 *
 * `Match` is admissible and an Effect *runtime* call would not be: a total dispatch computes, it
 * does not run. The import states what it requires and the role admits it or does not, so the line
 * is drawn by the requirement rather than by the module's name.
 */
import {
  armWhen,
  asConst,
  call,
  field,
  kernel,
  lam,
  list,
  lit,
  lt,
  matchWhen,
  op,
  record,
  spreadOf,
  type Term,
} from '../../../../scripts/tools/cell.ts'
import { t } from '../../../../scripts/tools/term.ts'

const num = t.number

/** `Array.from({ length: n }, (_, i) => at(i))` — the generated range two arms share. */
const range = (length: Term, at: (i: Term) => Term): Term =>
  call('Array.from', record({ length }), lam(['_', 'i'], (_, i) => at(i)))

const cell = kernel({
  imports: [{ module: 'effect/Match', namespace: 'Match' }],
  declarations: [
    {
      kind: 'type',
      name: 'RestartStrategyName',
      doc: [
        'The supervision strategies a restart decision covers.',
        '',
        'Declared here rather than imported from `restart-decision.schema.ts`: a kernel cell may',
        "import no other cell, so a pure body owns its domain rather than borrowing a schema's.",
        "The schema's `RestartStrategy` is the same literal union, so a decoded value satisfies",
        'this structurally.',
      ],
      value: t.union(t.literal('one_for_one'), t.literal('one_for_all'), t.literal('rest_for_one')),
    },
    {
      name: 'restartIndicesFor',
      doc: [
        'The child indices a restart covers, by supervision strategy.',
        '',
        'A pure total function: the one part of the restart decision that is computation rather',
        'than dispatch, so it lives here rather than in the emitted workflow cell.',
      ],
      term: lam(
        [['strategy', t.ref('RestartStrategyName')], ['failedIndex', num], ['total', num]],
        (strategy, failedIndex, total) =>
          matchWhen(
            strategy,
            armWhen('one_for_one', asConst(list(failedIndex))),
            armWhen(
              'one_for_all',
              asConst(list(
                lit(0),
                spreadOf(range(call('Math.max', lit(0), op('-', total, lit(1))), (i) => op('+', i, lit(1)))),
              )),
            ),
            armWhen(
              'rest_for_one',
              asConst(list(
                failedIndex,
                spreadOf(range(
                  call('Math.max', lit(0), op('-', op('-', total, failedIndex), lit(1))),
                  (i) => op('+', op('+', failedIndex, lit(1)), i),
                )),
              )),
            ),
          ),
        { returns: t.readonlyTuple([num], t.generic('ReadonlyArray', num)) },
      ),
    },
    {
      name: 'failedIndexAddressesAChild',
      doc: [
        "The cross-field invariant the decode input carries: a failed child's index addresses one of",
        'the children that exist.',
        '',
        'It lives here rather than inline in `Schema.filter` because a refinement predicate is a',
        'function body, and a declaration carries none. Naming it also makes it reachable by a',
        'property test, which an inline arrow is not.',
      ],
      term: lam(
        [[
          'input',
          t.object([{ name: 'failedIndex', type: num }, { name: 'totalChildren', type: num }], { multiline: true }),
        ]],
        (input) => lt(field(input, 'failedIndex'), field(input, 'totalChildren')),
        { returns: t.boolean },
      ),
    },
  ],
})

export default cell
