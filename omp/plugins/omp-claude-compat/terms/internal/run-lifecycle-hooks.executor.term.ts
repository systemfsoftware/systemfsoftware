/**
 * `src/internal/run-lifecycle-hooks.executor.ts`, as a term.
 *
 * The cell this compiles to is a nested `for...of` with three `continue` guards, an early return
 * and an `if`/`else` whose arms are both effects. None of those has a node in the language, and
 * none is needed: the guards are filters on the lists, the loops are `Effect.forEach`, and the
 * conditional is `Effect.if`. The compiled cell passes the package's lint, typecheck and 200 tests
 * unchanged, so this is a behaviour-preserving rewrite rather than a re-description.
 *
 * Two things the guard form gave away for free had to be recovered deliberately, and both were
 * found by a failing check rather than by reading:
 *
 * - `if (h.type !== 'command') continue` *narrows* `h` for the rest of the body. A boolean
 *   predicate does not, so `hook.command` became `error`-typed and `no-unsafe-argument` fired. The
 *   filter carries a refinement to keep the narrowing with the guard.
 * - A ternary over `Effect.forkDaemon(…)` and `runHookScript(…)` is a *union*, not an
 *   `Effect<A, E, R>`, so inference fell to `unknown` and 22 requirement errors landed at callers
 *   in the test files. `branch` compiles to `Effect.if`, which unifies both arms' channels.
 *
 * This file lives under `terms/` rather than beside its cell because `cell-suffix-required` governs
 * every file under `src/`: a term is not a cell, so `src/` is exactly where it may not go. The tree
 * mirrors `src/`, and the authorship gate maps between the two.
 */
import {
  ambient,
  and,
  branch,
  effectFn,
  eq,
  executor,
  field,
  filter,
  forEach,
  invoke,
  last,
  let_,
  lit,
  ne,
  not,
  nothing,
  or,
  record,
  ref,
  tagged,
  thunk,
  undef,
} from '../../../../../scripts/tools/cell.ts'
import { t } from '../../../../../scripts/tools/term.ts'

const HookEntry = t.ref('HookEntry')
const CommandHook = t.ref('CommandHook')
const HookSession = t.ref('HookSession')

const program = executor({
  imports: [
    { module: '@systemfsoftware/omp-utils', values: ['sessionIds'], requires: ambient },
    {
      module: 'effect',
      values: ['Array as Arr', 'Context', 'Effect', 'Schema as S'],
      types: ['Scope'],
      requires: nothing,
    },
    { module: '../hook-settings.acl.js', values: ['analyzeSettings'], requires: ambient, blankBefore: true },
    { module: '../hook-settings.acl.js', types: ['CommandHook', 'HookEntry'], typeOnly: true, requires: nothing },
    { module: './hook-session.kernel.js', types: ['HookSession'], typeOnly: true, requires: nothing },
    { module: './run-hook-script.executor.js', values: ['runHookScript'], requires: ambient },
    { module: './supervise-fork.executor.js', values: ['superviseFork'], requires: ambient },
  ],
  declarations: [
    { kind: 'class-tag', name: 'RunLifecycleHooksExecutorDeps', service: t.ref('Scope.Scope') },
    {
      name: 'runLifecycleHooks',
      term: effectFn(
        'runLifecycleHooks',
        [['entries', t.readonlyArrayOf(HookEntry)], ['ctx', HookSession], ['event', t.string]],
        (entries, ctx, event) =>
          let_('cwd', field(ctx, 'cwd'), (cwd) =>
            let_(
              'input',
              // The original spreads the session identifiers into a fresh record. The annotation is
              // load-bearing for `runHookScript`'s parameter, so it is declared rather than inferred.
              record({}, { spread: [invoke('sessionIds', thunk(invoke('ctx.sessionManager.getSessionId')))] }),
              (input) =>
                let_(
                  'matcherUnreadable',
                  // The matcher axis is the same refusal `runHooksForEvent` makes: an event whose
                  // matcher this bridge cannot read must not run a matcher'd hook as though the
                  // matcher had matched.
                  invoke('analyzeSettings', tagged('MatcherUnreadable', { event }), ref('S.Boolean')),
                  (matcherUnreadable) =>
                    last(
                      forEach(
                        filter(
                          entries,
                          'entry',
                          (entry) => not(and(matcherUnreadable, ne(field(entry, 'matcher'), undef))),
                        ),
                        'entry',
                        (entry) =>
                          forEach(
                            filter(
                              field(entry, 'hooks'),
                              'hook',
                              (hook) => and(eq(field(hook, 'type'), lit('command')), eq(field(hook, 'if'), undef)),
                              { refine: CommandHook },
                            ),
                            'hook',
                            (hook) =>
                              branch(
                                or(eq(field(hook, 'async'), lit(true)), eq(field(hook, 'asyncRewake'), lit(true))),
                                invoke(
                                  'Effect.forkDaemon',
                                  invoke(
                                    'superviseFork',
                                    invoke('runHookScript', hook, input, cwd, event, lit(false)),
                                    ctx,
                                    field(hook, 'command'),
                                  ),
                                ),
                                invoke('runHookScript', hook, input, cwd, event),
                              ),
                          ),
                      ),
                    ),
                ),
              t.record(t.string, t.unknown),
            )),
      ),
    },
  ],
})

export default program
