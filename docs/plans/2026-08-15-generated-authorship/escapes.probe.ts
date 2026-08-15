/**
 * The escapes an adversarial pass found, each now a refusal.
 *
 * Every block below is a hole that was open and verified open: a term reaching a kernel cell without
 * any combinator deciding its requirements. They are kept as a file rather than as a changelog note
 * because a closed hole reopens silently — the phantom's `?` was one character, and the version of
 * this mechanism that shipped with it looked exactly as sound as the version without.
 *
 *     deno check docs/plans/2026-08-15-generated-authorship/escapes.probe.ts
 *
 * Exit 0 means every `@ts-expect-error` still fires. The two escapes that are not type errors —
 * a forged brand and a deliberate `as` — are runtime and review concerns; `escapes.run.ts` beside
 * this file covers the first.
 */
import { type Ambient, invoke, kernel, lam, lit, type Term } from '../../../scripts/tools/cell.ts'

/**
 * The structural literal, and the reason the phantom field is required.
 *
 * With an optional phantom this compiled with no cast and no combinator: `Term`'s only other member
 * is `raw`, so any object carrying a raw node satisfied `Term<never>` and an ambient read reached a
 * kernel through an object literal. Making `of` module-private was no defence at all, because
 * nothing had to call it.
 */
export const structuralLiteral = kernel({
  declarations: [
    // @ts-expect-error a bare `{ raw }` no longer satisfies Term: the requirement channel is required.
    { name: 'now', term: { raw: { ref: 'Date.now' } } },
  ],
})

/** The same shape one level in, since a nested literal is the form that would survive a shallow fix. */
export const structuralNested = kernel({
  declarations: [
    {
      name: 'stale',
      // @ts-expect-error the operand is a literal object, not a term; `op` cannot accept it.
      term: lam([['ttl', { ref: 'number' }]], () => ({ raw: { ref: 'cachedAt' } })),
    },
  ],
})

/**
 * The rewrap: taking an impure term apart and rebuilding it as a pure one.
 *
 * `raw()` was exported to hand the compiler a bare node, and that export was the door — `{ raw:
 * raw(impure) } as Term` reconstructed a `Term<never>` from a `Term<Ambient>` with no cast on the
 * requirement itself. It is module-private now, so the rewrap has nothing to call.
 */
export const rewrap = () => {
  // @ts-expect-error `raw` is not exported: the channel has no eraser outside the module.
  return kernel({ declarations: [{ name: 'now', term: { raw: raw(invoke('Date.now')) } }] })
}

/**
 * A `Term<Ambient>` widened by annotation rather than by cast.
 *
 * Worth separating from the sanctioned `as`: an author who writes a type annotation is not obviously
 * doing anything unusual, so if annotation alone widened the channel the mechanism would leak
 * through ordinary code. It does not — assignment is checked in the same direction as an argument.
 */
export const widenByAnnotation = () => {
  // @ts-expect-error Term<Ambient> is not assignable to Term<never>; annotating does not discharge it.
  const laundered: Term = invoke('Date.now')
  return laundered
}

/** The control: the same read, in a role whose requirement set contains it, still compiles. */
export const honest = kernel({
  declarations: [{ name: 'double', term: lam([['n', { ref: 'number' }]], (n) => n) }],
})

/** The marker is re-exported so the run-probe beside this file can name the same requirement. */
export type Requirement = Ambient

/** Referenced so the import of `lit` is not dead while the escapes are the file's subject. */
export const one = lit(1)
