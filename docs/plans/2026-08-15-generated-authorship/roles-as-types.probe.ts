/**
 * Does a role type actually refuse a violating cell, or does it only document one?
 *
 * Each block below is a kernel-doctrine violation the repository currently enforces with an AST
 * walker. The claim under test is that the *signature* refuses it — that the error arrives from
 * `tsc` at the term, in this file, with no rule installed and nothing to walk. A block that
 * compiles is a failed claim, so every one carries `@ts-expect-error`: the marker inverts the test,
 * because `tsc` then fails when the error it names does *not* occur.
 *
 * That inversion is the point. A probe asserting "this compiles" passes when nothing is enforced.
 * This one fails.
 *
 * Run: `deno check roles-as-types.probe.ts` — exit 0 means every violation was refused.
 */
import { and, call, field, fold, invoke, kernel, lam, lit, lt, op, pure, ref, t } from './probe-imports.ts'

// ---------------------------------------------------------------- accepted: a closed kernel

/**
 * The control. A kernel over its arguments and vetted pure host operations, requiring nothing.
 *
 * If this failed, every refusal below would be vacuous — the type would be rejecting everything.
 */
export const accepted = kernel({
  declarations: [
    {
      name: 'clampedRange',
      term: lam(
        [['total', t.number], ['from', t.number]],
        (total, from) => call('Math.max', lit(0), op('-', total, from)),
        { returns: t.number },
      ),
    },
    {
      name: 'sum',
      term: lam(
        [['xs', t.readonlyArrayOf(t.number)]],
        (xs) => fold(xs, lit(0), ['acc', 'x'], (acc, x) => op('+', acc, x)),
        { returns: t.number },
      ),
    },
    {
      name: 'addressesAChild',
      term: lam(
        [['input', t.object([{ name: 'failedIndex', type: t.number }, { name: 'total', type: t.number }])]],
        (input) => lt(field(input, 'failedIndex'), field(input, 'total')),
        { returns: t.boolean },
      ),
    },
  ],
})

// ---------------------------------------------------------------- refused: ambient impurity

/**
 * `kernel-no-ambient-impurity` — a clock read.
 *
 * `ref` yields `Term<Ambient>` and a kernel declaration is `Term<never>`, so the assignment fails.
 * The walker version of this rule matches an identifier list; this version cannot be evaded by
 * spelling, because the requirement rides the term rather than the name.
 */
export const clockRead = kernel({
  declarations: [
    // @ts-expect-error Term<Ambient> is not assignable to Term<never>: a kernel accounts for every reference it makes.
    { name: 'now', term: invoke('Date.now') },
  ],
})

/** The same refusal one indirection away — the case the corpus predicts an interior walker misses. */
export const clockBehindAnArgument = kernel({
  declarations: [
    {
      name: 'staleAfter',
      // @ts-expect-error the impurity is nested two combinators deep and still reaches the signature.
      term: lam([['ttl', t.number]], (ttl) => op('<', ttl, invoke('Date.now'))),
    },
  ],
})

/** And behind a `&&`, where the requirement is unioned in from the right operand only. */
export const impurityInOneOperand = kernel({
  declarations: [
    {
      name: 'enabled',
      // @ts-expect-error one impure operand is enough: the union carries Ambient upward.
      term: lam(['flag'], (flag) => and(flag, ref('process.env.ENABLED'))),
    },
  ],
})

// ---------------------------------------------------------------- refused: an unvetted callee

/**
 * `pure` takes a closed literal union, so an unlisted callee is refused at the argument rather
 * than by a heuristic over the identifier.
 */
export const unvettedCallee = kernel({
  declarations: [
    // @ts-expect-error 'Math.random' is not a PureGlobal: the pure set is data, not a guess.
    { name: 'jitter', term: call('Math.random') },
  ],
})

// ---------------------------------------------------------------- refused: a cell import

/**
 * A type-only import of another cell — **accepted**, and the acceptance is the finding.
 *
 * A filename-keyed boundary rule has to reject this: the specifier ends `.acl.js`, and a walker
 * reading the text sees a kernel importing an ACL. It is harmless — a type contributes nothing at
 * runtime — and the tree relies on it, measured at 7 type-only cell imports across the 87 kernel
 * cells, against 2 value imports of a `Schema` (itself inert). Requirements draw the line where the
 * filename cannot: `requires` is what an import brings, and a type brings nothing.
 */
export const cellTypeImport = kernel({
  imports: [
    { module: '../hook-settings.acl.js', types: ['HookEntry'], typeOnly: true },
  ],
  declarations: [{ name: 'identity', term: lam(['x'], (x) => x) }],
})

/** The same for a node runtime module, which the doctrine bans for the same reason. */
export const runtimeImport = kernel({
  imports: [
    // @ts-expect-error 'node:fs' resolves to never: a kernel takes its inputs as arguments.
    { module: 'node:fs', values: ['readFileSync'], requires: ambient },
  ],
  declarations: [{ name: 'identity', term: lam(['x'], (x) => x) }],
})

/** A bare builtin, since the specifier need not carry the `node:` prefix to be one. */
export const bareRuntimeImport = kernel({
  imports: [
    // @ts-expect-error 'fs/promises' resolves to never.
    { module: 'fs/promises', values: ['readFile'], requires: ambient },
  ],
  declarations: [{ name: 'identity', term: lam(['x'], (x) => x) }],
})

// ---------------------------------------------------------------- refused: an Effect construction

/**
 * `kernel-no-effect-runtime`, and more than it.
 *
 * The walker distinguishes constructing an Effect from running one, and bans the second. Here both
 * are refused, because a kernel that names Effect at all has imported it — and the import is the
 * thing the doctrine forbids. The distinction the rule draws is between two impure things.
 */
export const effectConstruction = kernel({
  declarations: [
    // @ts-expect-error Term<Effectful> is not assignable to Term<never>.
    { name: 'described', term: gen(last(pure('undefined'))) },
  ],
})

// A local import kept out of the main block so the refusal above is about the term, not the import.
import { gen, last } from './probe-imports.ts'
