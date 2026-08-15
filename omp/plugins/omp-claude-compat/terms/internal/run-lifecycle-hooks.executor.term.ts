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
import type { CellProgram } from '../../../../../scripts/tools/term-compile.ts'
import {
  and,
  branch,
  call,
  effectFn,
  eq,
  field,
  filter,
  forEach,
  last,
  let_,
  lit,
  ne,
  not,
  or,
  ref,
  t,
  tagged,
  thunk,
  undef,
} from '../../../../../scripts/tools/term.ts'

const HookEntry = t.ref('HookEntry')
const CommandHook = t.ref('CommandHook')
const HookSession = t.ref('HookSession')

const program: CellProgram = {
  imports: [
    { module: '@systemfsoftware/omp-utils', values: ['sessionIds'] },
    { module: 'effect', values: ['Array as Arr', 'Context', 'Effect', 'Schema as S'], types: ['Scope'] },
    { module: '../hook-settings.acl.js', values: ['analyzeSettings'], blankBefore: true },
    { module: '../hook-settings.acl.js', types: ['CommandHook', 'HookEntry'], typeOnly: true },
    { module: './hook-session.kernel.js', types: ['HookSession'], typeOnly: true },
    { module: './run-hook-script.executor.js', values: ['runHookScript'] },
    { module: './supervise-fork.executor.js', values: ['superviseFork'] },
  ],
  declarations: [
    { kind: 'class-tag', name: 'RunLifecycleHooksExecutorDeps', service: t.ref('Scope.Scope') },
    {
      kind: 'term',
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
              { record: {}, spread: [call('sessionIds', thunk(call('ctx.sessionManager.getSessionId')))] },
              (input) =>
                let_(
                  'matcherUnreadable',
                  // The matcher axis is the same refusal `runHooksForEvent` makes: an event whose
                  // matcher this bridge cannot read must not run a matcher'd hook as though the
                  // matcher had matched.
                  call('analyzeSettings', tagged('MatcherUnreadable', { event }), ref('S.Boolean')),
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
                                call(
                                  'Effect.forkDaemon',
                                  call(
                                    'superviseFork',
                                    call('runHookScript', hook, input, cwd, event, lit(false)),
                                    ctx,
                                    field(hook, 'command'),
                                  ),
                                ),
                                call('runHookScript', hook, input, cwd, event),
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
}

export default program
