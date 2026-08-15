/**
 * Is the number of roles structural, or is it a fact about what anyone named?
 *
 * The claim under test is that naming a role costs three lines and changes nothing else — that no
 * table is amended, no compiler branch is added, and the roles already named keep their exact
 * verdicts. If that holds, "thirteen" was never a property of the architecture; it was an inventory,
 * and this file could have named a fourteenth in passing.
 *
 * Each block is either a refusal `tsc` must produce or an acceptance it must not object to. Run:
 *
 *     deno check docs/plans/2026-08-15-generated-authorship/roles-derived.probe.ts
 *
 * Exit 0 means every `@ts-expect-error` fired and every acceptance compiled.
 */
import {
  type Ambient,
  type Effectful,
  effectful,
  executor,
  gen,
  invoke,
  kernel,
  lam,
  last,
  lit,
  op,
  ref,
  role,
  translation,
} from '../../../scripts/tools/cell.ts'
import { t } from '../../../scripts/tools/term.ts'

// ---------------------------------------------------------------- the three named roles differ

/** A closed computation: admitted by every role, since `never` is below all of them. */
export const pureInKernel = kernel({
  declarations: [{ name: 'double', term: lam([['n', t.number]], (n) => op('*', n, lit(2))) }],
})

/** The same term in an effectful role. A wider requirement set admits a narrower term. */
export const pureInExecutor = executor({
  declarations: [{ name: 'double', term: lam([['n', t.number]], (n) => op('*', n, lit(2))) }],
})

/** An effect: admitted by `executor`, whose requirement set contains `Effectful`. */
export const effectInExecutor = executor({
  imports: [{ module: 'effect', namespace: 'Effect', requires: effectful }],
  declarations: [
    { name: 'run', term: lam([], () => gen(last(lit(1)))) },
  ],
})

/** The same effect in `kernel`, which admits `never`. The requirement is what refuses it. */
export const effectInKernel = kernel({
  declarations: [
    // @ts-expect-error `gen` yields Term<Effectful>, and a kernel's declarations are Term<never>.
    { name: 'run', term: lam([], () => gen(last(lit(1)))) },
  ],
})

/** An ambient read: admitted by `translation`, whose set contains `Ambient` and not `Effectful`. */
export const ambientInTranslation = translation({
  declarations: [{ name: 'now', term: lam([], () => invoke('Date.now')) }],
})

/** The same read in `kernel`. */
export const ambientInKernel = kernel({
  declarations: [
    // @ts-expect-error `invoke` on an unbound name yields Term<Ambient>; a kernel admits neither.
    { name: 'now', term: lam([], () => invoke('Date.now')) },
  ],
})

/** An effect in `translation`, which reaches outside itself but runs nothing. */
export const effectInTranslation = translation({
  declarations: [
    // @ts-expect-error Effectful is not in translation's requirement set; Ambient alone is.
    { name: 'run', term: lam([], () => gen(last(lit(1)))) },
  ],
})

// ---------------------------------------------------------------- naming a fourteenth

/**
 * A role that did not exist when this file was written, named here in one expression.
 *
 * Nothing in `cell.ts` was touched to admit it: no union gained a member, no array gained an entry,
 * no compiler branch was added. That is the whole claim about the count — an inventory is a fact
 * about a codebase, and this line is what amending one costs.
 */
export const projection = role<Ambient, 'term'>('projection', ['term'])

/** It admits an ambient read, because its requirement set says so. */
export const readInProjection = projection({
  declarations: [{ name: 'now', term: lam([], () => invoke('Date.now')) }],
})

/** And it declares terms only, so a type declaration is refused — at runtime, by kind. */
export const typeInProjection = () =>
  projection({
    declarations: [
      // @ts-expect-error 'projection' declares terms; a type declaration is not one of its kinds.
      { kind: 'type', name: 'Alias', value: t.string },
    ],
  })

// ---------------------------------------------------------------- the requirement rides the term

/**
 * The property that makes this a channel rather than a naming convention: a requirement is carried
 * by the term, so it survives nesting. An interior AST rule reads an identifier and stops at the
 * first indirection; a requirement is in the type of the whole expression.
 */
export const nestedAmbient = kernel({
  declarations: [
    {
      name: 'expired',
      // @ts-expect-error two combinators deep, and Ambient still reaches the declaration's type.
      term: lam([['ttl', t.number]], (ttl) => op('<', ttl, ref('cachedAt'))),
    },
  ],
})

/** One impure operand of a two-operand expression is enough: the union carries it upward. */
export const oneImpureOperand = kernel({
  declarations: [
    {
      name: 'enabled',
      // @ts-expect-error the left operand is pure; the union of both is not.
      term: lam([['flag', t.boolean]], (flag) => op('&&', flag, ref('process.env.ENABLED'))),
    },
  ],
})

/** The marker types are exported so a role can be named outside this repo's own tooling. */
export type Markers = readonly [Ambient, Effectful]
