/**
 * The authoring surface for the term language: TypeScript, typechecked as you write it.
 *
 * The compiler in `term-compile.ts` takes a `Term`. Where a `Term` comes from is a separate
 * decision, and JSON was the wrong one - it bought a parser for free and cost everything else:
 * no autocomplete, no arity check, errors reported against compiled output rather than against
 * the term, and eight kilobytes of brackets for one cell. This module is the front-end that
 * should have been there.
 *
 * **Binders are TypeScript functions, so TypeScript's scoping is the term's scoping.** A variable
 * exists only inside the callback that receives it:
 *
 * ```ts
 * fix('ackermann', ['m', 'n'], (ackermann, m, n) => cond(eq(m, lit(0)), ...))
 * ```
 *
 * `m` is a `Term` in that arrow's body and nowhere else, and the arrow's arity is checked against
 * the parameter list by the type system. That deletes a subsystem rather than moving it: the
 * compiler's scope check existed to catch a name used outside its binder, which is now a
 * compile error in the authoring file, at the term, with the name underlined.
 *
 * **Sequencing is a continuation chain, for the same reason.** A `do` block's later steps see
 * earlier binds, which an array literal cannot express without naming variables twice. `bind`
 * takes the rest of the block as a function of the value it binds, so the value's scope is
 * exactly the rest of the block:
 *
 * ```ts
 * gen(bind('user', fetchUser, (user) => ret(field(user, 'name'))))
 * ```
 */
import type { Arm, BinOp, ListItem, Step, Term, TermParam } from './term-compile.ts'
import type { TypeExpr } from './type-decl.ts'

export type { Term, TypeExpr }

/** A parameter list entry: a bare name, or a name with its type. */
export type ParamSpec = string | readonly [string, TypeExpr]

type Vars<N extends readonly ParamSpec[]> = { readonly [K in keyof N]: Term }

const nameOf = (p: ParamSpec): string => typeof p === 'string' ? p : p[0]

const paramOf = (p: ParamSpec): TermParam => typeof p === 'string' ? { name: p } : { name: p[0], type: p[1] }

const varsOf = <N extends readonly ParamSpec[]>(params: N): Vars<N> =>
  params.map((p) => ({ var: nameOf(p) })) as unknown as Vars<N>

// ---------------------------------------------------------------- leaves

export const lit = (value: string | number | boolean | null): Term => ({ lit: value })

/** A name from outside the term: an import, or another declaration in the same file. */
export const ref = (name: string): Term => ({ ref: name })

export const undef: Term = { ref: 'undefined' }

// ---------------------------------------------------------------- operators

export const op = (name: BinOp, left: Term, right: Term): Term => ({ op: { name, args: [left, right] } })

export const eq = (left: Term, right: Term): Term => op('===', left, right)
export const ne = (left: Term, right: Term): Term => op('!==', left, right)
export const and = (left: Term, right: Term): Term => op('&&', left, right)
export const or = (left: Term, right: Term): Term => op('||', left, right)
export const not = (of: Term): Term => ({ not: of })

export const lt = (left: Term, right: Term): Term => op('<', left, right)
export const le = (left: Term, right: Term): Term => op('<=', left, right)
export const gt = (left: Term, right: Term): Term => op('>', left, right)
export const ge = (left: Term, right: Term): Term => op('>=', left, right)

/** `x.name`, or `x['name']` where the name is not an identifier. */
export const field = (of: Term, name: string): Term => ({ field: { of, name } })

/** `a.b.c` in one call, since a chain of projections is the commonest shape in a cell. */
export const path = (of: Term, ...names: readonly string[]): Term => names.reduce(field, of)

export const app = (fn: Term, ...args: readonly Term[]): Term => ({ app: { fn, args } })

/** `Effect.succeed(x)` and friends: a qualified callee applied to arguments. */
export const call = (callee: string, ...args: readonly Term[]): Term => app(ref(callee), ...args)

export const list = (...items: readonly ListItem[]): Term => ({ list: items })

/** A list element that spreads another list into this one. */
export const spreadOf = (of: Term): { readonly spreadOf: Term } => ({ spreadOf: of })

export const asConst = (of: Term): Term => ({ asConst: of })

export const record = (
  fields: Readonly<Record<string, Term>>,
  options?: { readonly spread?: readonly Term[] },
): Term => options?.spread === undefined ? { record: fields } : { record: fields, spread: options.spread }

export const tagged = (tag: string, fields?: Readonly<Record<string, Term>>): Term =>
  fields === undefined ? { tagged: { tag } } : { tagged: { tag, fields } }

// ---------------------------------------------------------------- branching

export const cond = (test: Term, then: Term, otherwise: Term): Term => ({
  cond: { if: test, then, else: otherwise },
})

/**
 * The effect-world conditional. `cond` produces a ternary, and a ternary over two different Effect
 * types is a union rather than an `Effect<A, E, R>`, which loses every requirement the arms carry.
 */
export const branch = (test: Term, then: Term, otherwise: Term): Term => ({
  branch: { if: test, then, else: otherwise },
})

/** One arm of a `match`. The bound value is scoped to the arm's body. */
export const arm = (tag: string, bind: string, body: (value: Term) => Term): Arm => ({
  tag,
  bind,
  body: body({ var: bind }),
})

/** An arm that ignores the matched value. */
export const armOf = (tag: string, body: Term): Arm => ({ tag, body })

export const match = (on: Term, ...arms: readonly Arm[]): Term => ({ match: { on, arms } })

/** Dispatch over a *literal* union - `Match.when('one_for_one', …)` - rather than over `_tag`. */
export const matchWhen = (on: Term, ...arms: readonly Arm[]): Term => ({ match: { on, arms, by: 'when' } })

/** Dispatch over a named discriminant field rather than `_tag`. */
export const matchOn = (on: Term, on_field: string, ...arms: readonly Arm[]): Term => ({
  match: { on, arms, by: 'discriminator', on_field },
})

// ---------------------------------------------------------------- binders

export const lam = <const N extends readonly ParamSpec[]>(
  params: N,
  body: (...vars: Vars<N>) => Term,
  options?: { readonly returns?: TypeExpr },
): Term => ({
  lam: {
    params: params.map(paramOf),
    body: body(...varsOf(params)),
    ...(options?.returns === undefined ? {} : { returns: options.returns }),
  },
})

/** A lambda of no arguments: `() => body`. */
export const thunk = (body: Term): Term => ({ lam: { params: [], body } })

/**
 * General recursion. The first argument the callback receives is the function itself, in scope
 * only inside its own body - which is what makes this node the one TypeScript has no form for.
 */
export const fix = <const N extends readonly ParamSpec[]>(
  name: string,
  params: N,
  body: (self: Term, ...vars: Vars<N>) => Term,
  options?: { readonly returns?: TypeExpr },
): Term => ({
  fix: {
    name,
    params: params.map(paramOf),
    body: body({ var: name }, ...varsOf(params)),
    ...(options?.returns === undefined ? {} : { returns: options.returns }),
  },
})

/** `Arr.reduce`: the accumulator and the element are scoped to the step. */
export const fold = (
  over: Term,
  init: Term,
  names: readonly [acc: string, item: string],
  step: (acc: Term, item: Term) => Term,
): Term => ({
  fold: {
    over,
    init,
    step: { acc: names[0], item: names[1], body: step({ var: names[0] }, { var: names[1] }) },
  },
})

/**
 * `Arr.filter`. `refine` emits the predicate as `item is T`, which is what keeps a guard's
 * narrowing when the guard moves out of a loop body.
 */
export const filter = (
  over: Term,
  item: string,
  keep: (value: Term) => Term,
  options?: { readonly refine?: TypeExpr },
): Term => ({
  filter: {
    over,
    item,
    keep: keep({ var: item }),
    ...(options?.refine === undefined ? {} : { refine: options.refine }),
  },
})

/** `Effect.forEach`, discarding results unless `collect` asks for them. */
export const forEach = (
  over: Term,
  item: string,
  body: (value: Term) => Term,
  options?: { readonly collect?: boolean },
): Term => ({
  forEach: {
    over,
    item,
    body: body({ var: item }),
    ...(options?.collect === true ? { collect: true } : {}),
  },
})

export const pipe = (of: Term, ...through: readonly Term[]): Term => ({ pipe: { of, through } })

// ---------------------------------------------------------------- sequencing

/**
 * A partially built generator body: the steps so far, and the result if one has been given.
 *
 * The chain is built inside-out - each combinator receives the rest of the block as a function -
 * so a bound value's scope is exactly the continuation that can see it.
 */
export interface Seq {
  readonly steps: readonly Step[]
  readonly result?: Term
}

const prepend = (step: Step, rest: Seq): Seq =>
  rest.result === undefined
    ? { steps: [step, ...rest.steps] }
    : { steps: [step, ...rest.steps], result: rest.result }

/** `const name = yield* value`, with `name` scoped to the rest of the block. */
export const bind = (name: string, value: Term, rest: (bound: Term) => Seq): Seq =>
  prepend({ bind: name, value }, rest({ var: name }))

/** `const name = value` - a plain binding, with no `yield*`. */
export const let_ = (name: string, value: Term, rest: (bound: Term) => Seq, type?: TypeExpr): Seq =>
  prepend({ bind: name, value, pure: true, ...(type === undefined ? {} : { type }) }, rest({ var: name }))

/** `yield* value` for its effect only. */
export const run = (value: Term, rest: () => Seq): Seq => prepend({ value }, rest())

/** The last step, run for its effect, with no result. */
export const last = (value: Term): Seq => ({ steps: [{ value }] })

/** `return value`. */
export const ret = (value: Term): Seq => ({ steps: [], result: value })

export const gen = (body: Seq): Term => ({
  do: body.result === undefined ? { steps: body.steps } : { steps: body.steps, result: body.result },
})

/** `Effect.fn('span')(function* (…) { … })` - a traced effectful function. */
export const effectFn = <const N extends readonly ParamSpec[]>(
  span: string,
  params: N,
  body: (...vars: Vars<N>) => Seq,
): Term => {
  const seq = body(...varsOf(params))
  return {
    effectFn: {
      span,
      params: params.map(paramOf),
      steps: seq.steps,
      ...(seq.result === undefined ? {} : { result: seq.result }),
    },
  }
}

// ---------------------------------------------------------------- types

/** The type expressions a term needs, named so a cell reads as TypeScript rather than as JSON. */
export const t = {
  ref: (name: string): TypeExpr => ({ ref: name }),
  string: { ref: 'string' } as TypeExpr,
  number: { ref: 'number' } as TypeExpr,
  boolean: { ref: 'boolean' } as TypeExpr,
  unknown: { ref: 'unknown' } as TypeExpr,
  void: { ref: 'void' } as TypeExpr,
  generic: (of: string, ...args: readonly TypeExpr[]): TypeExpr => ({ generic: { of, args } }),
  record: (key: TypeExpr, value: TypeExpr): TypeExpr => ({ generic: { of: 'Record', args: [key, value] } }),
  arrayOf: (of: TypeExpr): TypeExpr => ({ arrayOf: of }),
  readonlyArrayOf: (of: TypeExpr): TypeExpr => ({ readonlyArrayOf: of }),
  readonlyTuple: (head: readonly TypeExpr[], rest?: TypeExpr): TypeExpr =>
    rest === undefined ? { readonlyTuple: head } : { readonlyTuple: head, rest },
  object: (
    members: readonly { readonly name: string; readonly type: TypeExpr }[],
    options?: { readonly multiline?: boolean },
  ): TypeExpr => options?.multiline === true ? { object: members, multiline: true } : { object: members },
  union: (...members: readonly TypeExpr[]): TypeExpr => ({ union: members }),
  literal: (value: string | number | boolean): TypeExpr => ({ literal: value }),
} as const
