#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * A term language for cells, and its compiler to TypeScript.
 *
 * The earlier emitters were data-description formats: a schema cell is a description of data, so
 * a JSON description of it round-trips. That works exactly as far as cells that do not compute,
 * and stops dead at the first function body - which is most of the tree. The wall was a defect in
 * the language, not a discovery about the code, and this file removes it.
 *
 * **The language is Turing complete.** `fix` binds a name to a function inside its own body, `cond`
 * branches, and `op` computes on numbers, which is general recursion plus a conditional plus
 * arithmetic - enough for mu-recursion. `docs/plans/` carries the demonstration: Ackermann's
 * function, which is not primitive recursive, is written as a term, compiled, run, and checked
 * against known values. Nothing in a cell is out of reach by construction.
 *
 * **It is not a transcript of the TypeScript AST, and now that is checkable rather than argued.**
 * The two node sets are disjoint in both directions:
 *
 * - The language has no node for `while`, `for`, `throw`, assignment, `try`, `delete`, `new`, a
 *   bare block, or a statement of any kind. There is no field for one.
 * - TypeScript has no node for `fix`, `match`, `fold`, or `do`. Each of those compiles to a
 *   *pattern*: `match` becomes `Match.value(x).pipe(Match.tag(...), Match.exhaustive)`, `do`
 *   becomes `Effect.gen(function* () { ... })` with a `yield*` per step, `fold` becomes
 *   `Arr.reduce`, and `fix` becomes a self-referential const. One term node, several TypeScript
 *   nodes, chosen by the compiler rather than named by the author.
 *
 * That asymmetry is the whole argument. An echo can only reproduce; a compiler decides. And the
 * decisions are the ones the repo's rules are about - a `match` cannot be inexhaustive because
 * `Match.exhaustive` is not optional in the expansion, and an accumulation cannot be a mutable
 * loop because `fold` is the only way to consume a list.
 */

import { renderTypeDeclaration, renderTypeExpr, type TypeDeclaration, type TypeExpr } from './type-decl.ts'

export type BinOp = '+' | '-' | '*' | '/' | '%' | '===' | '!==' | '<' | '<=' | '>' | '>=' | '&&' | '||' | '??'

const BIN_OPS: ReadonlySet<string> = new Set<BinOp>([
  '+',
  '-',
  '*',
  '/',
  '%',
  '===',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
  '??',
])

export interface TermParam {
  readonly name: string
  readonly type?: TypeExpr
}

export interface Bind {
  readonly name: string
  readonly value: Term
  readonly type?: TypeExpr
}

export interface Arm {
  /** The `_tag` this arm matches. */
  readonly tag: string
  /** The name the matched value binds to inside `body`. */
  readonly bind?: string
  readonly body: Term
}

/** A list element, or a spread of another list into this one. */
export type ListItem = Term | { readonly spreadOf: Term }

export interface Step {
  /** Omitted for a step run only for its effect. */
  readonly bind?: string
  readonly value: Term
  /**
   * A step that names a plain value rather than running an effect: `const cwd = ctx.cwd`, with no
   * `yield*`. Sequencing and naming are different acts and the language keeps them distinct.
   */
  readonly pure?: boolean
  /** An explicit type at the binding, where inference would widen or lose it. */
  readonly type?: TypeExpr
}

export type Term =
  | { readonly lit: string | number | boolean | null }
  /** A local name: a parameter, a `let` bind, a `fix` name, a fold accumulator. */
  | { readonly var: string }
  /** A name from outside the term: an import, or another declaration in this file. */
  | { readonly ref: string }
  | { readonly lam: { readonly params: readonly TermParam[]; readonly body: Term; readonly returns?: TypeExpr } }
  | { readonly app: { readonly fn: Term; readonly args: readonly Term[] } }
  | { readonly let: { readonly binds: readonly Bind[]; readonly body: Term } }
  /**
   * General recursion: `name` is bound inside `body`, so the function may call itself. This is the
   * node that makes the language Turing complete, and TypeScript has no counterpart - it compiles
   * to a const whose initialiser mentions the const.
   */
  | {
    readonly fix: {
      readonly name: string
      readonly params: readonly TermParam[]
      readonly body: Term
      readonly returns?: TypeExpr
    }
  }
  | { readonly cond: { readonly if: Term; readonly then: Term; readonly else: Term } }
  /**
   * A conditional whose arms are *effects*, compiled to `Effect.if`.
   *
   * `cond` cannot serve here. A ternary over two different Effect types produces a union, and a
   * union is not an `Effect<A, E, R>` - inference falls to `unknown` and every requirement the arms
   * carry is lost, which is a type error at the caller rather than at the branch. `Effect.if` exists
   * precisely to unify two arms' A, E and R channels, so the effect-world branch is its own node.
   */
  | { readonly branch: { readonly if: Term; readonly then: Term; readonly else: Term } }
  /**
   * Exhaustive dispatch. The expansion is not optional about exhaustiveness.
   *
   * `by` picks the combinator, because the subject decides it rather than the author: a tagged
   * union matches on `_tag` (`Match.tag`), a literal union matches on the value itself
   * (`Match.when`), and a named discriminant uses `Match.discriminator`. All three place
   * `Match.exhaustive` themselves.
   */
  | {
    readonly match: {
      readonly on: Term
      readonly arms: readonly Arm[]
      readonly by?: 'tag' | 'when' | 'discriminator'
      /** The field name, required by and only meaningful for `discriminator`. */
      readonly on_field?: string
    }
  }
  /** `x as const` - the narrowing a literal tuple or object needs to keep its literal type. */
  | { readonly asConst: Term }
  | { readonly tagged: { readonly tag: string; readonly fields?: Readonly<Record<string, Term>> } }
  | { readonly record: Readonly<Record<string, Term>>; readonly spread?: readonly Term[] }
  | { readonly field: { readonly of: Term; readonly name: string } }
  | { readonly op: { readonly name: BinOp; readonly args: readonly [Term, Term] } }
  | { readonly list: readonly ListItem[] }
  /**
   * The only way to consume a list. A loop accumulating into a mutable binding has no node here;
   * this is what it becomes, and the expansion is `Arr.reduce`.
   */
  | {
    readonly fold: {
      readonly over: Term
      readonly init: Term
      readonly step: { readonly acc: string; readonly item: string; readonly body: Term }
    }
  }
  /**
   * Effectful iteration - the effect-world counterpart of `fold`, and what a `for...of` whose body
   * runs effects becomes. `discard` drops the collected results, which is the loop's semantics.
   */
  | {
    readonly forEach: {
      readonly over: Term
      readonly item: string
      readonly body: Term
      readonly collect?: boolean
    }
  }
  /**
   * Keeping the elements a predicate accepts. An `if (p) continue` at the top of a loop body is a
   * filter on the list, so the guard moves out of the body and the body loses its escape.
   */
  | {
    readonly filter: {
      readonly over: Term
      readonly item: string
      readonly keep: Term
      /**
       * The type the predicate proves, emitted as `item is T`.
       *
       * Without it the filter form loses something the guard form had: `if (h.type !== 'command')
       * continue` narrows `h` for the rest of the body, and a boolean predicate does not. Moving
       * the guard out of the body is only behaviour-preserving; carrying the refinement with it is
       * what makes it type-preserving too.
       */
      readonly refine?: TypeExpr
    }
  }
  | { readonly not: Term }
  /**
   * A traced effectful function - `Effect.fn('name')(function* (…) { … })`. The name is the span,
   * so it is data rather than a string a caller has to remember to pass.
   */
  | {
    readonly effectFn: {
      readonly span: string
      readonly params: readonly TermParam[]
      readonly steps: readonly Step[]
      readonly result?: Term
    }
  }
  /** Effect sequencing. Compiles to `Effect.gen` with one `yield*` per step. */
  | { readonly do: { readonly steps: readonly Step[]; readonly result?: Term } }
  | { readonly pipe: { readonly of: Term; readonly through: readonly Term[] } }

export interface ImportSpec {
  readonly module: string
  readonly values?: readonly string[]
  readonly types?: readonly string[]
  readonly typeOnly?: boolean
  readonly namespace?: string
  readonly alias?: Readonly<Record<string, string>>
  readonly blankBefore?: boolean
}

export interface TermDeclaration {
  readonly kind: 'term'
  readonly name: string
  readonly term: Term
  readonly annotation?: TypeExpr
  readonly export?: boolean
  readonly doc?: readonly string[]
}

/**
 * A `Context.Tag` class - the five-part pattern an Effect service identity takes:
 * `class X extends Context.Tag('X')<X, S>() {}`. TypeScript has no node for it; the compiler places
 * the self-reference, the string identifier and the empty body, so none of the three can drift apart.
 */
export interface ClassTagDeclaration {
  readonly kind: 'class-tag'
  readonly name: string
  /** Defaults to `name`: the two differing is a bug the pattern cannot express. */
  readonly tag?: string
  readonly service: TypeExpr
  readonly export?: boolean
  readonly doc?: readonly string[]
}

export type CellMember = TermDeclaration | TypeDeclaration | ClassTagDeclaration

export interface CellProgram {
  readonly imports: readonly ImportSpec[]
  readonly declarations: readonly CellMember[]
  readonly doc?: readonly string[]
}

const reject = (message: string): never => {
  throw new Error(`term rejected: ${message}`)
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const QUALIFIED = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/

const str = (s: string): string => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`

const key = (k: string): string => IDENT.test(k) ? k : str(k)

/**
 * Field names that would carry source text. There is no legitimate position for any of them: the
 * language's leaves are literals, names and operators, so a payload of TypeScript can only be an
 * attempt to smuggle a body past the compiler.
 */
const SOURCE_TEXT_FIELDS = ['code', 'body_text', 'raw', 'source', 'statements', 'js', 'ts', 'expr'] as const

/** Node names the language deliberately has no term for, reported by name rather than as "unknown". */
const REFUSED: Readonly<Record<string, string>> = {
  while: 'a `while` loop has no term. An unbounded repetition is `fix`, and a list is `fold`.',
  for: 'a `for` loop has no term. Consuming a list is `fold`; counting is `fix`.',
  assign: 'assignment has no term. A value that changes across steps is a `fold` accumulator or a `do` bind.',
  throw: 'a `throw` has no term. A failure is a value: `Effect.fail` through `ref`, inside `do`.',
  try: 'a `try` has no term. Recovering from a failure is a combinator applied through `pipe`.',
  new: '`new` has no term. Construct through a named factory, which is what the cell should export anyway.',
  block: 'a statement block has no term. Sequencing effects is `do`; naming intermediates is `let`.',
  return: 'a `return` has no term. A term *is* its value; `do` carries the result in `result`.',
  yield: 'a bare `yield` has no term. `do` places every `yield*` itself, one per step.',
}

const assertNoSourceText = (node: unknown, path: string): void => {
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoSourceText(v, `${path}[${i}]`))
    return
  }
  if (!isRecord(node)) return
  for (const field of SOURCE_TEXT_FIELDS) {
    if (field in node) {
      reject(`${path}.${field}: a term carries no source text. Its leaves are literals, names and operators.`)
    }
  }
  for (const [k, v] of Object.entries(node)) {
    const refusal = REFUSED[k]
    if (refusal !== undefined) reject(`${path}.${k}: ${refusal}`)
    assertNoSourceText(v, `${path}.${k}`)
  }
}

/** Terms that are a single token or already bracketed, so applying or projecting needs no parentheses. */
const isAtomic = (t: Term): boolean =>
  isRecord(t) &&
  ('lit' in t || 'var' in t || 'ref' in t || 'record' in t || 'list' in t || 'app' in t || 'field' in t ||
    'tagged' in t || 'match' in t || 'pipe' in t || 'do' in t || 'fold' in t)

/** JavaScript's binding power for the operators this language has, tighter binding first. */
const PRECEDENCE: Readonly<Record<string, number>> = {
  '*': 5,
  '/': 5,
  '%': 5,
  '+': 4,
  '-': 4,
  '<': 3,
  '<=': 3,
  '>': 3,
  '>=': 3,
  '===': 2,
  '!==': 2,
  '&&': 1,
  '||': 0,
  '??': 0,
}

/**
 * An operand of a binary operator, bracketed only where JavaScript would read it differently.
 *
 * Every operator here is left-associative, so a same-precedence child needs brackets on the right
 * and not on the left: `a - b - c` means `(a - b) - c`, and writing the left bracket changes
 * nothing while writing the right one changes everything.
 */
const operandAt = (
  child: Term,
  path: string,
  scope: Scope,
  parent: string,
  side: 'left' | 'right',
): string => {
  const rendered = compile(child, path, scope)
  if (!isRecord(child) || !('op' in child)) return isAtomic(child) ? rendered : `(${rendered})`
  const inner = PRECEDENCE[(child.op as { name: string }).name] ?? 0
  const outer = PRECEDENCE[parent] ?? 0
  const needs = inner < outer || (inner === outer && side === 'right')
  return needs ? `(${rendered})` : rendered
}

const atom = (t: Term, path: string, scope: Scope): string => {
  const rendered = compile(t, path, scope)
  return isAtomic(t) ? rendered : `(${rendered})`
}

/**
 * The names a term may mention. A `var` outside it is a compile error rather than a TypeScript one,
 * which is the difference between a language and a template: the scope is checked before emission.
 */
type Scope = ReadonlySet<string>

const extend = (scope: Scope, ...names: readonly string[]): Scope => new Set([...scope, ...names])

const params = (list: readonly TermParam[], path: string): string =>
  list
    .map((p, i) => {
      if (!isRecord(p) || typeof p.name !== 'string' || !IDENT.test(p.name)) {
        reject(`${path}.params[${i}].name: expected a parameter name`)
      }
      return p.type === undefined ? p.name : `${p.name}: ${renderTypeExpr(p.type, `${path}.params[${i}].type`)}`
    })
    .join(', ')

const paramNames = (list: readonly TermParam[]): readonly string[] => list.map((p) => p.name)

export const compile = (t: Term, path: string, scope: Scope): string => {
  if (!isRecord(t)) return reject(`${path}: expected a term, got ${JSON.stringify(t)}`)

  if ('lit' in t) {
    const v: unknown = t.lit
    if (typeof v === 'string') return str(v)
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v)
    return reject(`${path}.lit: expected a string, number, boolean or null`)
  }

  if ('var' in t) {
    if (typeof t.var !== 'string' || !IDENT.test(t.var)) reject(`${path}.var: expected a name`)
    if (!scope.has(t.var)) {
      reject(
        `${path}.var: ${str(t.var)} is not in scope. A name from outside the term is \`ref\`; ` +
          `in scope here: ${[...scope].sort().join(', ') || '(nothing)'}`,
      )
    }
    return t.var
  }

  if ('ref' in t) {
    if (typeof t.ref !== 'string' || !QUALIFIED.test(t.ref)) {
      reject(`${path}.ref: expected a name, optionally qualified`)
    }
    return t.ref
  }

  if ('lam' in t) {
    const l = t.lam
    const inner = extend(scope, ...paramNames(l.params))
    const returns = l.returns === undefined ? '' : `: ${renderTypeExpr(l.returns, `${path}.lam.returns`)}`
    return `(${params(l.params, `${path}.lam`)})${returns} => ${compile(l.body, `${path}.lam.body`, inner)}`
  }

  if ('app' in t) {
    const a = t.app
    if (!Array.isArray(a.args)) reject(`${path}.app.args: expected an array (empty is allowed)`)
    const args = a.args.map((x, i) => compile(x, `${path}.app.args[${i}]`, scope))
    return `${atom(a.fn, `${path}.app.fn`, scope)}(${args.join(', ')})`
  }

  if ('let' in t) {
    const l = t.let
    if (!Array.isArray(l.binds) || l.binds.length === 0) reject(`${path}.let.binds: expected at least one bind`)
    // A `let` is an immediately-applied lambda so that the term stays an expression: a cell's body is
    // one value, and introducing a statement here would put a block in a language that has none.
    let inner = scope
    const bound: string[] = []
    for (const [i, b] of l.binds.entries()) {
      if (!isRecord(b) || typeof b.name !== 'string' || !IDENT.test(b.name)) {
        reject(`${path}.let.binds[${i}].name: expected a name`)
      }
      bound.push(`${b.name} = ${compile(b.value, `${path}.let.binds[${i}].value`, inner)}`)
      inner = extend(inner, b.name)
    }
    return `((${l.binds.map((b) => b.name).join(', ')}) => ${compile(l.body, `${path}.let.body`, inner)})(${
      bound.map((b) => b.split(' = ').slice(1).join(' = ')).join(', ')
    })`
  }

  if ('fix' in t) {
    const f = t.fix
    if (typeof f.name !== 'string' || !IDENT.test(f.name)) reject(`${path}.fix.name: expected a name`)
    // The recursive name is in scope inside the body, which is what distinguishes this from `lam`.
    // TypeScript has no such form, so it compiles to a named function expression - the one shape
    // whose own identifier is visible in its body without a surrounding declaration.
    const inner = extend(scope, f.name, ...paramNames(f.params))
    const returns = f.returns === undefined ? '' : `: ${renderTypeExpr(f.returns, `${path}.fix.returns`)}`
    return `function ${f.name}(${params(f.params, `${path}.fix`)})${returns} { return ${
      compile(f.body, `${path}.fix.body`, inner)
    } }`
  }

  if ('cond' in t) {
    const c = t.cond
    return `${atom(c.if, `${path}.cond.if`, scope)} ? ${compile(c.then, `${path}.cond.then`, scope)} : ${
      compile(c.else, `${path}.cond.else`, scope)
    }`
  }

  if ('match' in t) {
    const m = t.match
    if (!Array.isArray(m.arms) || m.arms.length === 0) reject(`${path}.match.arms: expected at least one arm`)
    const by = m.by ?? 'tag'
    if (by === 'discriminator' && (typeof m.on_field !== 'string' || m.on_field === '')) {
      reject(`${path}.match.on_field: \`discriminator\` matches a named field, so the name is required`)
    }
    const combinator = by === 'tag'
      ? 'Match.tag'
      : by === 'when'
      ? 'Match.when'
      : `Match.discriminator(${str(m.on_field!)})`
    const arms = m.arms.map((arm, i) => {
      const at = `${path}.match.arms[${i}]`
      if (!isRecord(arm) || typeof arm.tag !== 'string' || arm.tag === '') reject(`${at}.tag: expected a tag`)
      // An arm that binds nothing takes no parameter: `() =>`, not `(_) =>`. The matched value is
      // already known from the tag, and a bound-but-unused name is noise the formatter keeps.
      const bind = arm.bind ?? ''
      if (bind !== '' && !IDENT.test(bind)) reject(`${at}.bind: expected a name`)
      const inner = arm.bind === undefined ? scope : extend(scope, arm.bind)
      return `  ${combinator}(${str(arm.tag)}, (${bind}) => ${compile(arm.body, `${at}.body`, inner)}),`
    })
    // `Match.exhaustive` is placed by the compiler, never by the author: a term cannot describe an
    // inexhaustive dispatch, so the rule about exhaustiveness has nothing left to catch.
    return `Match.value(${compile(m.on, `${path}.match.on`, scope)}).pipe(\n${arms.join('\n')}\n  Match.exhaustive,\n)`
  }

  if ('tagged' in t) {
    const g = t.tagged
    if (typeof g.tag !== 'string' || g.tag === '') reject(`${path}.tagged.tag: expected a tag`)
    const fields = Object.entries(g.fields ?? {}).map(([k, v]) =>
      `${key(k)}: ${compile(v, `${path}.tagged.fields.${k}`, scope)}`
    )
    return `{ _tag: ${str(g.tag)}${fields.length === 0 ? '' : `, ${fields.join(', ')}`} }`
  }

  if ('record' in t) {
    // A spread comes first, because a later key overriding a spread is the only ordering that makes
    // the record's own fields authoritative - which is what a caller reading it expects.
    const spread = ((t as { spread?: readonly Term[] }).spread ?? [])
      .map((s, i) => `...${compile(s, `${path}.spread[${i}]`, scope)}`)
    const entries = Object.entries(t.record).map(([k, v]) => `${key(k)}: ${compile(v, `${path}.record.${k}`, scope)}`)
    const all = [...spread, ...entries]
    return all.length === 0 ? '{}' : `{ ${all.join(', ')} }`
  }

  if ('field' in t) {
    const f = t.field
    if (typeof f.name !== 'string') reject(`${path}.field.name: expected a name`)
    return IDENT.test(f.name)
      ? `${atom(f.of, `${path}.field.of`, scope)}.${f.name}`
      : `${atom(f.of, `${path}.field.of`, scope)}[${str(f.name)}]`
  }

  if ('op' in t) {
    const o = t.op
    if (!BIN_OPS.has(o.name)) {
      reject(`${path}.op.name: ${JSON.stringify(o.name)} is not an operator here. Available: ${[...BIN_OPS].join(' ')}`)
    }
    if (!Array.isArray(o.args) || o.args.length !== 2) reject(`${path}.op.args: expected exactly two operands`)
    // Parenthesise only where precedence demands it. Emitting `(a - b) - c` for a left-associative
    // chain is correct and unreadable, and it makes the round-trip differ from every hand-written
    // expression in the tree - so the compiler carries the precedence table rather than bracketing
    // defensively.
    const left = operandAt(o.args[0], `${path}.op.args[0]`, scope, o.name, 'left')
    const right = operandAt(o.args[1], `${path}.op.args[1]`, scope, o.name, 'right')
    return `${left} ${o.name} ${right}`
  }

  if ('list' in t) {
    if (!Array.isArray(t.list)) reject(`${path}.list: expected an array`)
    const items = t.list.map((x, i) => {
      const at = `${path}.list[${i}]`
      return isRecord(x) && 'spreadOf' in x
        ? `...${compile(x.spreadOf as Term, `${at}.spreadOf`, scope)}`
        : compile(x as Term, at, scope)
    })
    return `[${items.join(', ')}]`
  }

  if ('asConst' in t) return `${atom(t.asConst, `${path}.asConst`, scope)} as const`

  if ('fold' in t) {
    const f = t.fold
    const s = f.step
    if (!isRecord(s) || !IDENT.test(String(s.acc)) || !IDENT.test(String(s.item))) {
      reject(`${path}.fold.step: expected \`acc\` and \`item\` names`)
    }
    const inner = extend(scope, s.acc, s.item)
    return `Arr.reduce(${compile(f.over, `${path}.fold.over`, scope)}, ${
      compile(f.init, `${path}.fold.init`, scope)
    }, (${s.acc}, ${s.item}) => ${compile(s.body, `${path}.fold.step.body`, inner)})`
  }

  if ('not' in t) return `!${atom(t.not, `${path}.not`, scope)}`

  if ('branch' in t) {
    const b = t.branch
    return `Effect.if(${compile(b.if, `${path}.branch.if`, scope)}, {\n  onTrue: () => ${
      compile(b.then, `${path}.branch.then`, scope)
    },\n  onFalse: () => ${compile(b.else, `${path}.branch.else`, scope)},\n})`
  }

  if ('filter' in t) {
    const f = t.filter
    if (typeof f.item !== 'string' || !IDENT.test(f.item)) reject(`${path}.filter.item: expected a name`)
    const inner = extend(scope, f.item)
    const signature = f.refine === undefined
      ? `(${f.item})`
      : `(${f.item}): ${f.item} is ${renderTypeExpr(f.refine, `${path}.filter.refine`)}`
    return `Arr.filter(${compile(f.over, `${path}.filter.over`, scope)}, ${signature} => ${
      compile(f.keep, `${path}.filter.keep`, inner)
    })`
  }

  if ('forEach' in t) {
    const f = t.forEach
    if (typeof f.item !== 'string' || !IDENT.test(f.item)) reject(`${path}.forEach.item: expected a name`)
    const inner = extend(scope, f.item)
    // `discard` is the default because a loop's results are what a loop throws away; asking for them
    // is the exception and has to be said.
    const options = f.collect === true ? '' : ', { discard: true }'
    return `Effect.forEach(${compile(f.over, `${path}.forEach.over`, scope)}, (${f.item}) => ${
      compile(f.body, `${path}.forEach.body`, inner)
    }${options})`
  }

  const generatorBody = (steps: readonly Step[], result: Term | undefined, at: string, start: Scope): string => {
    if (!Array.isArray(steps) || steps.length === 0) reject(`${at}.steps: expected at least one step`)
    let inner = start
    const lines: string[] = []
    for (const [i, s] of steps.entries()) {
      const sat = `${at}.steps[${i}]`
      if (!isRecord(s)) reject(`${sat}: expected a step`)
      const value = compile(s.value, `${sat}.value`, inner)
      if (s.bind === undefined) {
        if (s.pure === true) reject(`${sat}: a pure step names a value, so it needs a \`bind\``)
        lines.push(`  yield* ${value}`)
        continue
      }
      if (!IDENT.test(s.bind)) reject(`${sat}.bind: expected a name`)
      const at2 = s.type === undefined ? '' : `: ${renderTypeExpr(s.type, `${sat}.type`)}`
      lines.push(
        s.pure === true ? `  const ${s.bind}${at2} = ${value}` : `  const ${s.bind}${at2} = yield* ${value}`,
      )
      inner = extend(inner, s.bind)
    }
    if (result !== undefined) lines.push(`  return ${compile(result, `${at}.result`, inner)}`)
    return lines.join('\n')
  }

  if ('do' in t) {
    return `Effect.gen(function* () {\n${generatorBody(t.do.steps, t.do.result, `${path}.do`, scope)}\n})`
  }

  if ('effectFn' in t) {
    const f = t.effectFn
    if (typeof f.span !== 'string' || f.span === '') reject(`${path}.effectFn.span: expected the span name`)
    const inner = extend(scope, ...paramNames(f.params))
    return `Effect.fn(${str(f.span)})(function* (${params(f.params, `${path}.effectFn`)}) {\n${
      generatorBody(f.steps, f.result, `${path}.effectFn`, inner)
    }\n})`
  }

  if ('pipe' in t) {
    const p = t.pipe
    if (!Array.isArray(p.through) || p.through.length === 0) reject(`${path}.pipe.through: expected at least one stage`)
    const stages = p.through.map((s, i) => `  ${compile(s, `${path}.pipe.through[${i}]`, scope)},`)
    return `${atom(p.of, `${path}.pipe.of`, scope)}.pipe(\n${stages.join('\n')}\n)`
  }

  return reject(`${path}: unknown term ${JSON.stringify(Object.keys(t))}`)
}

const renderImport = (spec: ImportSpec, index: number): string => {
  if (!isRecord(spec) || typeof spec.module !== 'string' || spec.module === '') {
    reject(`imports[${index}].module: expected a specifier`)
  }
  if (spec.namespace !== undefined) {
    const prefix = spec.typeOnly === true ? 'import type' : 'import'
    return `${prefix} * as ${spec.namespace} from '${spec.module}'`
  }
  const named = (spec.values ?? []).map((v) => {
    const renamed = spec.alias?.[v]
    return renamed === undefined ? v : `${v} as ${renamed}`
  })
  const types = (spec.types ?? []).map((tn) => {
    const renamed = spec.alias?.[tn]
    const name = renamed === undefined ? tn : `${tn} as ${renamed}`
    return spec.typeOnly === true ? name : `type ${name}`
  })
  const names = [...named, ...types]
  if (names.length === 0) reject(`imports[${index}]: names nothing`)
  const prefix = spec.typeOnly === true ? 'import type' : 'import'
  return `${prefix} { ${names.join(', ')} } from '${spec.module}'`
}

const docBlock = (doc: readonly string[] | undefined): string => {
  if (doc === undefined || doc.length === 0) return ''
  if (doc.length === 1) return `/** ${doc[0]} */\n`
  return `/**\n${doc.map((l) => (l === '' ? ' *' : ` * ${l}`)).join('\n')}\n */\n`
}

const isTermDeclaration = (d: CellMember): d is TermDeclaration => (d as { kind?: unknown }).kind === 'term'

const isClassTag = (d: CellMember): d is ClassTagDeclaration => (d as { kind?: unknown }).kind === 'class-tag'

const renderClassTag = (d: ClassTagDeclaration, path: string): string => {
  if (typeof d.name !== 'string' || !IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
  const tag = d.tag ?? d.name
  const service = renderTypeExpr(d.service, `${path}.service`)
  return `${docBlock(d.doc)}${d.export === false ? '' : 'export '}class ${d.name} extends Context.Tag(${
    str(tag)
  })<\n  ${d.name},\n  ${service}\n>() {}`
}

/**
 * The names a term may reach without being in a local scope: every import binding plus every
 * declaration in the file. A `ref` to anything else compiles, and then fails to typecheck - so the
 * check is here, where the message can name the term rather than the emitted line.
 */
const topLevelScope = (program: CellProgram): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const spec of program.imports) {
    if (spec.namespace !== undefined) names.add(spec.namespace)
    for (const v of spec.values ?? []) names.add(spec.alias?.[v] ?? v)
  }
  for (const d of program.declarations) if (isTermDeclaration(d) || isClassTag(d)) names.add(d.name)
  return names
}

export const parseProgram = (raw: unknown): CellProgram => {
  if (!isRecord(raw)) reject('the program must be an object')
  const rec = raw as Record<string, unknown>
  assertNoSourceText(rec, 'program')
  if (!Array.isArray(rec.imports)) reject('imports: expected an array (empty is allowed)')
  const declarations: unknown = rec.declarations
  if (!Array.isArray(declarations) || declarations.length === 0) {
    reject('declarations: expected a non-empty array')
  }
  return rec as unknown as CellProgram
}

export const compileProgram = (program: CellProgram): string => {
  const imports = program.imports
    .map((spec, i) => `${spec.blankBefore === true && i > 0 ? '\n' : ''}${renderImport(spec, i)}`)
    .join('\n')
  const outer = topLevelScope(program)
  const body = program.declarations
    .map((d, i) => {
      const path = `declarations[${i}]`
      if (isClassTag(d)) return renderClassTag(d, path)
      if (!isTermDeclaration(d)) return renderTypeDeclaration(d, path)
      if (typeof d.name !== 'string' || !IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
      const annotation = d.annotation === undefined ? '' : `: ${renderTypeExpr(d.annotation, `${path}.annotation`)}`
      const value = compile(d.term, `${path}.term`, outer)
      // A `fix` at the top level is already a named function, so binding it to a const of the same
      // name would shadow it. It is emitted as the declaration itself.
      if (isRecord(d.term) && 'fix' in d.term && (d.term.fix as { name: string }).name === d.name) {
        return `${docBlock(d.doc)}${d.export === false ? '' : 'export '}${value}`
      }
      return `${docBlock(d.doc)}${d.export === false ? '' : 'export '}const ${d.name}${annotation} = ${value}`
    })
    .join('\n\n')
  const doc = docBlock(program.doc)
  return imports === '' ? `${doc}${body}\n` : `${imports}\n\n${doc}${body}\n`
}

/**
 * Loads a program from a `.term.ts` module, which default-exports its `CellProgram`.
 *
 * The import is dynamic because the specifier *is* runtime-selected: the path arrives on argv, and
 * the authorship gate calls this once per term file it discovers. There is no static specifier to
 * write.
 */
export const loadProgram = async (inPath: string): Promise<CellProgram> => {
  const url = new URL(inPath, `file://${Deno.cwd()}/`).href
  const mod = await import(url) as { readonly default?: unknown }
  if (mod.default === undefined) reject(`${inPath}: a .term.ts module must default-export its CellProgram`)
  return parseProgram(mod.default)
}

const main = async (): Promise<void> => {
  const [inPath, outPath] = Deno.args
  if (inPath === undefined) {
    console.error('usage: term-compile.ts <cell.term.ts> [out.ts]')
    Deno.exitCode = 1
    return
  }
  const out = compileProgram(await loadProgram(inPath))
  if (outPath === undefined) console.log(out)
  else {
    await Deno.writeTextFile(outPath, out)
    console.log(`compiled ${outPath} (${out.length} bytes) from ${inPath}`)
  }
}

if (import.meta.main) await main()
