/**
 * Roles as types.
 *
 * The hundred-odd AST rules in this repository exist for one reason: a cell is a file a human
 * types, so every constraint on it can only be checked after the text exists. Emission removes the
 * human, and the constraints stop needing a checker — but only if the language refuses to build
 * the violation in the first place. A compiler that happily compiles an impure kernel and leaves a
 * walker to complain has moved the typing but kept the debt.
 *
 * So a term carries what it *requires*, exactly as an `Effect` does. `Term<never>` requires
 * nothing: it is a closed computation over its arguments. `ref('Date.now')` requires `Ambient`,
 * `Effect.gen` requires `Effectful`, and a term built from those carries their union upward through
 * every combinator. A role is then a *type over terms* rather than a suffix over filenames:
 *
 * ```ts
 * kernel({ declarations: [{ name: 'reduce', term: fold(...) }] })          // Term<never>: compiles
 * kernel({ declarations: [{ name: 'now', term: call('Date.now') }] })      // Term<Ambient>: TS2345
 * ```
 *
 * The second line is not a lint finding. It is a type error at the term, in the authoring file,
 * before any cell exists — which is the strongest channel available and the one the rule fleet was
 * standing in for. `kernel-no-throw`, `kernel-no-ambient-impurity`, `kernel-no-effect-runtime` and
 * the import boundary are all consequences of a signature here, so none of them needs a walker.
 *
 * The requirement channel is covariant, so `Term<never>` is usable wherever a term is: purity
 * widens into impurity and never the reverse. That is the same variance Effect gives `R`, and it is
 * why this composes instead of needing a cast at each boundary.
 */
import { ROLE } from './role-brand.ts'
import type { BinOp, CellMember, CellProgram, Term as RawTerm, TermParam } from './term-compile.ts'
import type { TypeDeclaration, TypeExpr, TypeParam } from './type-decl.ts'

declare const RequirementId: unique symbol

/**
 * What a term needs from outside itself.
 *
 * `Ambient` is a reference the term cannot account for — a global, a clock, a random source, an
 * imported binding whose behaviour the term does not carry. `Effectful` is an Effect construction
 * or execution. Both are phantom: they exist to be *refused* by a role that cannot admit them.
 */
export interface Ambient {
  readonly _tag: 'Ambient'
}

export interface Effectful {
  readonly _tag: 'Effectful'
}

/**
 * The markers as values, so an import can state what it brings.
 *
 * A requirement is otherwise only inferable from a term, and an import has no term to infer from —
 * the module's body is not in scope. Naming it is the one place the author asserts rather than
 * derives, and it is the right place for the assertion: a role admits or refuses the import on it,
 * so understating a requirement is a claim about a module that its own emission will contradict.
 */
export const ambient: Ambient = { _tag: 'Ambient' }

export const effectful: Effectful = { _tag: 'Effectful' }

/**
 * A term and the requirements it carries. `R = never` is a closed, pure computation.
 *
 * The phantom field is **required**, and that is the whole of its load-bearing behaviour. Optional,
 * the interface is structurally satisfiable without it: `{ raw: { ref: 'Date.now' } }` is a
 * well-typed `Term<never>` with no cast and no combinator, so the ambient read reaches a kernel
 * through a plain object literal. Required, `of` below is the only thing that can produce one, and
 * `of` is module-private — so every term in existence came from a combinator that decided its
 * requirements.
 *
 * A deliberate `as Term` still launders one, because `Term<never>` is a supertype of `Term<Ambient>`
 * and no type system refuses a cast. That is the sanctioned escape: it is one token, it is visible
 * in review, and the repository already bans casts in cells by rule.
 */
export interface Term<out R = never> {
  readonly raw: RawTerm
  readonly [RequirementId]: (_: never) => R
}

const of = <R = never>(raw: RawTerm): Term<R> => ({ raw }) as unknown as Term<R>

/**
 * Erases the requirement channel for the compiler, which only ever sees the raw term.
 *
 * Module-private: exported, it is an unbolted door out of the channel — `{ raw: raw(impure) } as
 * Term` reconstructs a pure-typed term from an impure one, which is the escape the required phantom
 * above exists to close.
 */
const raw = <R>(t: Term<R>): RawTerm => t.raw

// ---------------------------------------------------------------- closed leaves

export const lit = (value: string | number | boolean | null): Term => of({ lit: value })

/**
 * A reference this term can account for: a member of the closed set of pure host operations.
 *
 * The set is a literal union rather than a string, so a name outside it is a type error at the
 * call. This is the whole reason `Math.max` may appear in a kernel and `Date.now` may not — the
 * distinction is data the language carries, not a heuristic a walker applies to an identifier.
 */
export type PureGlobal =
  | 'Math.max'
  | 'Math.min'
  | 'Math.abs'
  | 'Math.floor'
  | 'Math.ceil'
  | 'Math.round'
  | 'Math.sign'
  | 'Math.trunc'
  | 'Math.pow'
  | 'Number.isInteger'
  | 'Number.isFinite'
  | 'Number.isNaN'
  | 'Number.parseInt'
  | 'Number.parseFloat'
  | 'Array.from'
  | 'Array.isArray'
  | 'Array.of'
  | 'Object.keys'
  | 'Object.values'
  | 'Object.entries'
  | 'Object.freeze'
  | 'Object.is'
  | 'String'
  | 'Number'
  | 'Boolean'
  | 'JSON.stringify'
  | 'JSON.parse'
  /**
   * `Symbol.for` — deterministic in its key, so it belongs here on the derivation rather than by
   * analogy to the other entries.
   *
   * It does touch a process-global registry, which is what makes the call worth arguing rather than
   * assuming. What the requirement channel tracks is whether a term's result depends on anything
   * beyond its arguments: `Symbol.for('x')` returns the same symbol for the same key, in any order,
   * at any time, with no clock, no I/O and no randomness. The registry write is not observable
   * except through another `Symbol.for` with the same key, which is the definition of the identity
   * it returns. `Symbol()` is a different matter and is deliberately absent — it returns a fresh
   * symbol each call, so its result is not a function of its arguments.
   */
  | 'Symbol.for'
  /**
   * Effect's pure constructors: they build a description of work, they do not perform any.
   *
   * The line is between a constructor and a runner, and it is a real one rather than a convenient
   * one. `Effect.succeed(x)` allocates a value whose result is a function of `x` alone — nothing is
   * scheduled, nothing is read, and calling it twice with the same argument yields equivalent
   * descriptions. `Effect.runSync` and `Effect.runPromise` are what execute, and they are absent for
   * exactly that reason: a kernel that runs an Effect has reached outside itself, which is the
   * `Effectful` requirement the `gen` and `effectFn` combinators carry.
   *
   * A kernel importing `effect` therefore states `requires: nothing` honestly, because what it takes
   * from the module is a set of data constructors.
   */
  | 'Effect.succeed'
  | 'Effect.fail'
  | 'Effect.void'
  | 'Option.some'
  | 'Option.none'
  | 'Either.right'
  | 'Either.left'
  | 'undefined'
  | 'null'

export const pure = <N extends PureGlobal>(name: N): Term => of({ ref: name })

/**
 * Any other reference, which the term cannot account for.
 *
 * This is deliberately the only escape hatch and it is typed as one: whatever it names, the term
 * now requires `Ambient` and no role that forbids ambient references will accept it.
 */
export const ref = (name: string): Term<Ambient> => of<Ambient>({ ref: name })

export const undef: Term = pure('undefined')

// ---------------------------------------------------------------- propagating combinators

export const op = <A, B>(name: BinOp, left: Term<A>, right: Term<B>): Term<A | B> =>
  of<A | B>({ op: { name, args: [left.raw, right.raw] } })

export const eq = <A, B>(l: Term<A>, r: Term<B>): Term<A | B> => op('===', l, r)
export const ne = <A, B>(l: Term<A>, r: Term<B>): Term<A | B> => op('!==', l, r)
export const lt = <A, B>(l: Term<A>, r: Term<B>): Term<A | B> => op('<', l, r)
export const le = <A, B>(l: Term<A>, r: Term<B>): Term<A | B> => op('<=', l, r)
export const and = <A, B>(l: Term<A>, r: Term<B>): Term<A | B> => op('&&', l, r)
export const or = <A, B>(l: Term<A>, r: Term<B>): Term<A | B> => op('||', l, r)
export const not = <A>(of_: Term<A>): Term<A> => of<A>({ not: of_.raw })

export const field = <A>(target: Term<A>, name: string): Term<A> => of<A>({ field: { of: target.raw, name } })

export const cond = <A, B, C>(test: Term<A>, then: Term<B>, otherwise: Term<C>): Term<A | B | C> =>
  of<A | B | C>({ cond: { if: test.raw, then: then.raw, else: otherwise.raw } })

/**
 * The requirements a tuple of terms carries, unioned.
 *
 * A plain `...args: readonly Term<A>[]` infers one `A` for every argument, and TypeScript resolves
 * that to the best common supertype rather than the union — so mixing an `Ambient` argument with an
 * `Effectful` one is rejected at the second, in a role that admits both. That is a false positive,
 * and a false positive in a mechanism like this is worse than a small gap: the only way past it is a
 * cast, so over-rejecting teaches authors to reach for the one escape the design cannot close.
 *
 * Each signature below defaults its tuple to `[]`. Without the default a call with no arguments has
 * nothing to infer from, so the parameter resolves to its own constraint — `readonly Term<unknown>[]`
 * — and the requirement widens to `unknown`, which is assignable to nothing and rejects the call in
 * every role. `invoke('Date.now')` is exactly that shape, so the default is load-bearing rather than
 * tidy.
 */
/**
 * The requirement one term carries.
 *
 * The naked type parameter is the load-bearing part: a conditional over a bare parameter distributes,
 * so a union of terms maps to the union of their requirements and `never` maps to `never`. Written
 * inline as `As[number] extends Term<infer R> ? R : never` the check type is an indexed access
 * rather than a bare parameter, so nothing distributes — and matching `never` against `Term<infer R>`
 * infers `R = unknown`, which every role rejects. A zero-argument call is exactly that case, so this
 * indirection is the difference between `invoke('Date.now')` working and failing everywhere.
 */
type RequirementOf<T> = T extends Term<infer R> ? R : never

type RequirementsOf<As extends readonly Term<unknown>[]> = RequirementOf<As[number]>

export const app = <F, const As extends readonly Term<unknown>[] = []>(
  fn: Term<F>,
  ...args: As
): Term<F | RequirementsOf<As>> => of({ app: { fn: fn.raw, args: args.map(raw) } })

/** `Math.max(0, n)` — a pure host call, which stays pure only because `pure` vetted the callee. */
export const call = <N extends PureGlobal, const As extends readonly Term<unknown>[] = []>(
  callee: N,
  ...args: As
): Term<RequirementsOf<As>> => of({ app: { fn: { ref: callee }, args: args.map(raw) } })

/**
 * The same call with its arguments pre-broken, one per line.
 *
 * A separate constructor rather than an options argument, because `call` is variadic and there is
 * nowhere in its signature for an options object to go without becoming another argument.
 */
export const callBroken = <N extends PureGlobal, const As extends readonly Term<unknown>[] = []>(
  callee: N,
  ...args: As
): Term<RequirementsOf<As>> => of({ app: { fn: { ref: callee }, args: args.map(raw), multiline: true } })

/** A call to anything else, which requires `Ambient` for the same reason `ref` does. */
export const invoke = <const As extends readonly Term<unknown>[] = []>(
  callee: string,
  ...args: As
): Term<Ambient | RequirementsOf<As>> => of({ app: { fn: { ref: callee }, args: args.map(raw) } })

export const list = <const As extends readonly Term<unknown>[] = []>(
  ...items: As
): Term<RequirementsOf<As>> => of({ list: items.map(raw) })

export const spreadOf = <A>(target: Term<A>): Term<A> => of<A>({ spreadOf: target.raw } as unknown as RawTerm)

export const asConst = <A>(target: Term<A>): Term<A> => of<A>({ asConst: target.raw })

/**
 * An object literal, optionally spreading other records into it.
 *
 * A spread's requirement is the record's own: spreading an impure value in makes the literal impure,
 * which is why `spread` is threaded through `A` rather than accepted as opaque raw terms.
 */
export const record = <A>(
  fields: Readonly<Record<string, Term<A>>>,
  options?: { readonly spread?: readonly Term<A>[] },
): Term<A> =>
  of<A>({
    record: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.raw])),
    ...(options?.spread === undefined ? {} : { spread: options.spread.map(raw) }),
  })

/**
 * A tagged data constructor: `{ _tag: 'Name', …fields }`.
 *
 * Inert data, so it requires only what its fields require — the tag is a string the emitter writes.
 */
export const tagged = <A>(tag: string, fields?: Readonly<Record<string, Term<A>>>): Term<A> =>
  of<A>({
    tagged: fields === undefined
      ? { tag }
      : { tag, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.raw])) },
  })

/**
 * A nullary arrow: `() => body`.
 *
 * The requirement is kept rather than discharged. Wrapping an effect in an arrow defers *when* it
 * runs and changes nothing about whether it does, so a thunk over an impure body is impure — the
 * one place this is easy to get wrong, because the arrow reads like a boundary.
 */
export const thunk = <R>(body: Term<R>): Term<R> => of<R>({ lam: { params: [], body: body.raw } })

// ---------------------------------------------------------------- binders

type ParamSpec = string | readonly [string, TypeExpr]

type Vars<N extends readonly ParamSpec[]> = { readonly [K in keyof N]: Term }

const nameOf = (p: ParamSpec): string => typeof p === 'string' ? p : p[0]
const paramOf = (p: ParamSpec): TermParam => typeof p === 'string' ? { name: p } : { name: p[0], type: p[1] }
const varsOf = <N extends readonly ParamSpec[]>(params: N): Vars<N> =>
  params.map((p) => of({ var: nameOf(p) })) as unknown as Vars<N>

/**
 * A parameter is always a closed `Term`: whatever the caller passes, the body cannot see past the
 * binding, so a lambda's requirements are exactly its body's.
 */
export const lam = <const N extends readonly ParamSpec[], R>(
  params: N,
  body: (...vars: Vars<N>) => Term<R>,
  options?: { readonly returns?: TypeExpr; readonly typeParams?: readonly TypeParam[] },
): Term<R> =>
  of<R>({
    lam: {
      params: params.map(paramOf),
      body: body(...varsOf(params)).raw,
      ...(options?.returns === undefined ? {} : { returns: options.returns }),
      ...(options?.typeParams === undefined ? {} : { typeParams: options.typeParams }),
    },
  })

/** General recursion. Requirements are the body's; recursion adds none. */
export const fix = <const N extends readonly ParamSpec[], R>(
  name: string,
  params: N,
  body: (self: Term, ...vars: Vars<N>) => Term<R>,
  options?: { readonly returns?: TypeExpr },
): Term<R> =>
  of<R>({
    fix: {
      name,
      params: params.map(paramOf),
      body: body(of({ var: name }), ...varsOf(params)).raw,
      ...(options?.returns === undefined ? {} : { returns: options.returns }),
    },
  })

export const fold = <A, B, C>(
  over: Term<A>,
  init: Term<B>,
  names: readonly [acc: string, item: string],
  step: (acc: Term, item: Term) => Term<C>,
): Term<A | B | C> =>
  of<A | B | C>({
    fold: {
      over: over.raw,
      init: init.raw,
      step: {
        acc: names[0],
        item: names[1],
        body: step(of({ var: names[0] }), of({ var: names[1] })).raw,
      },
    },
  })

export interface Arm<R> {
  readonly tag: string
  readonly bind?: string
  readonly body: Term<R>
}

export const arm = <R>(tag: string, bind: string, body: (value: Term) => Term<R>): Arm<R> => ({
  tag,
  bind,
  body: body(of({ var: bind })),
})

export const armWhen = <R>(value: string, body: Term<R>): Arm<R> => ({ tag: value, body })

const matchWith = <A, R>(by: 'tag' | 'when', on: Term<A>, arms: readonly Arm<R>[]): Term<A | R> =>
  of<A | R>({
    match: {
      on: on.raw,
      by,
      arms: arms.map((
        a,
      ) => (a.bind === undefined ? { tag: a.tag, body: a.body.raw } : { tag: a.tag, bind: a.bind, body: a.body.raw })),
    },
  })

/** Exhaustive dispatch over `_tag`. Exhaustiveness is the compiler's, never the author's. */
export const match = <A, R>(on: Term<A>, ...arms: readonly Arm<R>[]): Term<A | R> => matchWith('tag', on, arms)

/** Exhaustive dispatch over a literal union. */
export const matchWhen = <A, R>(on: Term<A>, ...arms: readonly Arm<R>[]): Term<A | R> => matchWith('when', on, arms)

// ---------------------------------------------------------------- effects

/**
 * Every Effect construct requires `Effectful`, which is what keeps them out of a kernel by type.
 *
 * A kernel is allowed to be a pure *description* under the doctrine, but not to name Effect at
 * all here: naming it means importing it, and the import is the thing a kernel may not have. The
 * distinction the doctrine draws between constructing and running an effect is a distinction
 * between two impure things, and neither is `Term<never>`.
 */
export interface Step<R> {
  readonly bind?: string
  readonly value: Term<R>
  readonly pure?: boolean
  readonly type?: TypeExpr
}

export interface Seq<R> {
  readonly steps: readonly Step<R>[]
  readonly result?: Term<R>
}

const prepend = <R>(step: Step<R>, rest: Seq<R>): Seq<R> =>
  rest.result === undefined
    ? { steps: [step, ...rest.steps] }
    : { steps: [step, ...rest.steps], result: rest.result }

export const bind = <A, B>(name: string, value: Term<A>, rest: (bound: Term) => Seq<B>): Seq<A | B> =>
  prepend<A | B>({ bind: name, value }, rest(of({ var: name })) as Seq<A | B>)

export const let_ = <A, B>(
  name: string,
  value: Term<A>,
  rest: (bound: Term) => Seq<B>,
  type?: TypeExpr,
): Seq<A | B> =>
  prepend<A | B>(
    { bind: name, value, pure: true, ...(type === undefined ? {} : { type }) },
    rest(of({ var: name })) as Seq<A | B>,
  )

export const last = <R>(value: Term<R>): Seq<R> => ({ steps: [{ value }] })

export const ret = <R>(value: Term<R>): Seq<R> => ({ steps: [], result: value })

export const gen = <R>(body: Seq<R>): Term<Effectful | R> =>
  of<Effectful | R>({
    do: body.result === undefined
      ? { steps: body.steps.map((s) => ({ ...s, value: s.value.raw })) }
      : { steps: body.steps.map((s) => ({ ...s, value: s.value.raw })), result: body.result.raw },
  })

export const effectFn = <const N extends readonly ParamSpec[], R>(
  span: string,
  params: N,
  body: (...vars: Vars<N>) => Seq<R>,
): Term<Effectful | R> => {
  const seq = body(...varsOf(params))
  return of<Effectful | R>({
    effectFn: {
      span,
      params: params.map(paramOf),
      steps: seq.steps.map((s) => ({ ...s, value: s.value.raw })),
      ...(seq.result === undefined ? {} : { result: seq.result.raw }),
    },
  })
}

export const forEach = <A, B>(
  over: Term<A>,
  item: string,
  body: (value: Term) => Term<B>,
  options?: { readonly collect?: boolean },
): Term<Effectful | A | B> =>
  of<Effectful | A | B>({
    forEach: {
      over: over.raw,
      item,
      body: body(of({ var: item })).raw,
      ...(options?.collect === true ? { collect: true } : {}),
    },
  })

export const filter = <A, B>(
  over: Term<A>,
  item: string,
  keep: (value: Term) => Term<B>,
  options?: { readonly refine?: TypeExpr },
): Term<A | B> =>
  of<A | B>({
    filter: {
      over: over.raw,
      item,
      keep: keep(of({ var: item })).raw,
      ...(options?.refine === undefined ? {} : { refine: options.refine }),
    },
  })

export const branch = <A, B, C>(test: Term<A>, then: Term<B>, otherwise: Term<C>): Term<Effectful | A | B | C> =>
  of<Effectful | A | B | C>({ branch: { if: test.raw, then: then.raw, else: otherwise.raw } })

// ---------------------------------------------------------------- roles, derived

/**
 * There is no list of roles here, and that absence is the design.
 *
 * An earlier version of this file typed a thirteen-member `CellSuffix` union and asked the import
 * boundary to test membership in it. That is inheritance dressed as derivation: the number came
 * from a table, nothing in the code could have disagreed with it, and adding a fourteenth would
 * have meant editing the compiler. The corpus's own ruling is that a cell vocabulary is an input to
 * a project's construction rather than a fact — so a compiler that hardcodes one has answered a
 * question it was supposed to be asked.
 *
 * What is actually derivable is a *pair*, and both halves were already here:
 *
 * 1. **What a cell's terms may require** — the `R` channel. `never` is a closed computation;
 *    `Ambient` reaches outside itself; `Effectful` runs.
 * 2. **What a cell may declare** — terms, type declarations, service tags.
 *
 * A role is a point in that product, so `kernel` is not primitive: it is the name for *(requires
 * nothing, declares terms and types)*. The count of roles is however many points anyone names,
 * which is a fact about a codebase rather than about the world. Naming a fourteenth costs three
 * lines and touches nothing, and deleting one leaves no hole, because no list exists to hole.
 */

/** What a cell may declare. */
export type DeclarationKind = 'term' | 'type' | 'class-tag'

/** A declaration whose term is closed over exactly the requirements the role admits. */
export interface TermDecl<R> {
  readonly name: string
  readonly term: Term<R>
  readonly doc?: readonly string[]
  readonly annotation?: TypeExpr
  readonly export?: boolean
  /** `false` sits this declaration tight under its predecessor, with no blank line between. */
  readonly blankBefore?: boolean
}

/**
 * A type declaration, reusing the shared language rather than restating it.
 *
 * It matters for the *error message*: a local interface with an index signature matches almost any
 * object, so TypeScript reports a rejected term against the type declaration instead of against the
 * term declaration, and the diagnostic names a missing `kind` rather than the impurity that
 * actually failed. A discriminated union puts the error where the defect is.
 */
export type TypeDecl = TypeDeclaration

/** A service identity: `class X extends Context.Tag('X')<X, S>() {}`. */
export interface TagDecl {
  readonly kind: 'class-tag'
  readonly name: string
  readonly tag?: string
  readonly service: TypeExpr
  readonly doc?: readonly string[]
  readonly export?: boolean
}

/** The declaration forms a role admits, selected by the kinds it names. */
export type DeclOf<R, K extends DeclarationKind> =
  | (K extends 'term' ? TermDecl<R> : never)
  | (K extends 'type' ? TypeDecl : never)
  | (K extends 'class-tag' ? TagDecl : never)

/**
 * The claim an import makes about a value import that brings no requirement with it.
 *
 * A word rather than an omission, because an omitted field is a claim nobody made. `requires` is the
 * one place in this file where the author asserts instead of deriving — an import's body is not in
 * scope, so nothing can infer what a foreign module does — and an optional assertion defaults to the
 * most permissive reading every time it is forgotten. Spelling it makes forgetting a type error and
 * leaves understating it a visible lie.
 */
export type Pure = 'requires-nothing'

export const nothing: Pure = 'requires-nothing'

/**
 * An import and the requirements it brings with it.
 *
 * This replaces a suffix test, and it is the sounder mechanism rather than a smaller one. A module
 * specifier is a *proxy* for what a module does: `.acl.js` was banned from a kernel because an ACL
 * reaches outside itself, and the ban was carried by the filename because nothing else was
 * available to carry it. Here the import states what it requires, the role admits it or does not,
 * and a rename cannot change the verdict.
 *
 * What this does **not** decide is whether the claim is true. An author who writes `nothing`
 * over `node:fs` has said something false, and no signature over this file can catch it — the module
 * is not in scope. That residue belongs to `cell-import-boundary`, which keys its verdict on the
 * specifier and is therefore immune to what the author claims: the two mechanisms are complementary
 * rather than redundant, and the rule is a survivor for exactly this reason.
 */
export interface ImportOf<R> {
  readonly module: string
  /** A default import: `import runtime from './runtime.kernel.js'`. */
  readonly default?: string
  /**
   * What this import brings. `nothing` for a type, a pure combinator or a constant.
   *
   * Required even where the role admits nothing else: for a role whose requirement set is empty the
   * only well-typed value is `nothing`, so the field costs one word and buys the
   * difference between a stated claim and a default.
   */
  readonly requires: R | Pure
  readonly values?: readonly string[]
  readonly types?: readonly string[]
  readonly typeOnly?: boolean
  readonly namespace?: string
  readonly alias?: Readonly<Record<string, string>>
  readonly blankBefore?: boolean
}

export interface CellOf<R, K extends DeclarationKind> {
  readonly doc?: readonly string[]
  readonly imports?: readonly ImportOf<R>[]
  readonly declarations: readonly DeclOf<R, K>[]
}

/**
 * Names a role by its two constraints and returns its constructor.
 *
 * The returned function is where the obligation is discharged: a declaration whose term carries a
 * requirement outside `R` fails to typecheck at the authoring site, before the cell exists. The
 * `kinds` array is checked at runtime because a declaration's kind is data, not a type parameter
 * the caller supplies — passing a tag to a role that declares none is a rejection with a message
 * rather than a silent emission.
 */
export const role = <R = never, K extends DeclarationKind = DeclarationKind>(
  name: string,
  kinds: readonly K[],
) =>
(cell: CellOf<R, K>): CellProgram => {
  const admitted: ReadonlySet<string> = new Set(kinds)
  const program: CellProgram = {
    imports: (cell.imports ?? []).map(withoutRequirements),
    declarations: cell.declarations.map((d, i) => member(d, i, name, admitted)),
    ...(cell.doc === undefined ? {} : { doc: cell.doc }),
  }
  return Object.defineProperty(program, ROLE, { value: name, enumerable: false })
}

/**
 * One declaration, admitted or refused by kind.
 *
 * A term's requirements were already checked by the caller's signature, so nothing here re-decides
 * purity: by the time a declaration reaches this function the only open question is whether the role
 * declares that *kind* of thing at all, which is data rather than a type the caller supplies.
 */
const member = (d: unknown, index: number, roleName: string, admitted: ReadonlySet<string>): CellMember => {
  const kind = kindOf(d)
  if (!admitted.has(kind)) {
    throw new Error(
      `${roleName} declares ${[...admitted].join(', ')}; declarations[${index}] is a ${kind}. ` +
        `A role admits the declaration kinds it names and no others.`,
    )
  }
  if (kind !== 'term') return d as CellMember
  const decl = d as TermDecl<unknown>
  return { kind: 'term', name: decl.name, term: raw(decl.term), ...optional(decl) }
}

const kindOf = (d: unknown): DeclarationKind => {
  if (typeof d === 'object' && d !== null && 'term' in d) return 'term'
  const kind = (d as { kind?: unknown }).kind
  return kind === 'class-tag' ? 'class-tag' : 'type'
}

/** `requires` is a type-level obligation, so it never reaches the emitted import statement. */
const withoutRequirements = <R>(spec: ImportOf<R>): Omit<ImportOf<R>, 'requires'> => {
  const { requires: _requires, ...rest } = spec
  return rest
}

/**
 * A closed computation over its arguments: the role every purity rule was approximating.
 *
 * Four of the kernel doctrine's constraints are consequences of `R = never` rather than rules:
 * no ambient impurity, because `ref` yields `Term<Ambient>`; no Effect runtime, because every
 * effect combinator yields `Term<Effectful>`; no throw, because the language has no node for one;
 * and no impure import, because an import declaring a requirement is refused the same way a term
 * is. What it does not decide — how many computations belong in one cell — is cardinality, which no
 * signature over one file answers.
 */
export const kernel = role<never, 'term' | 'type'>('kernel', ['term', 'type'])

/**
 * Effectful work with a service identity: an operation, its dependency tag, its sequencing.
 *
 * Defined here in one line to make the point that the count is not structural. It admits
 * `Effectful` and `Ambient` because an operation runs and reads; it admits a tag because it owns
 * its dependencies. Nothing about the compiler changed to add it.
 */
export const executor = role<Effectful | Ambient, 'term' | 'type' | 'class-tag'>(
  'executor',
  ['term', 'type', 'class-tag'],
)

/** A declaration's optional fields, omitted rather than set to `undefined`. */
const optional = <R>(
  d: TermDecl<R>,
): { doc?: readonly string[]; annotation?: TypeExpr; export?: boolean; blankBefore?: boolean } => ({
  ...(d.doc === undefined ? {} : { doc: d.doc }),
  ...(d.annotation === undefined ? {} : { annotation: d.annotation }),
  ...(d.export === undefined ? {} : { export: d.export }),
  ...(d.blankBefore === undefined ? {} : { blankBefore: d.blankBefore }),
})

/**
 * Role types exist above this line; below it every cell is one `CellProgram`.
 *
 * The compiler never learns which role it is compiling, and that is the design: a role is a
 * constraint on how a program may be *built*, discharged before compilation, not a mode the
 * compiler switches on.
 */
