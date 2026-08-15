/**
 * The workflow declaration, authored in TypeScript.
 *
 * A workflow cell's shape is data — a command type, two tagged unions, and a dispatch from the one to
 * the others — so unlike a kernel it needs no program language. What it needed was a *typed* surface:
 * the same shape written as JSON is unchecked until the emitter runs, and every field name, every
 * `kind` string and every path is a spelling the author gets no help with. Here a misspelled field
 * kind is a type error at the declaration, before any emitter is involved.
 *
 * The constructors below build exactly the object `parseWorkflow` already validates, so that parser
 * stays the single authority on what a declaration may contain. This module adds no vocabulary and
 * removes none; it makes the existing vocabulary say its own name.
 *
 * `workflow()` is the role constructor, and it stamps the brand for the same reason the term language
 * does: something has to decide that this shape is a workflow's, and a filename is an assertion rather
 * than a decision. A hand-built object reaching the emitter is refused.
 */
import { ROLE } from './role-brand.ts'

// ---------------------------------------------------------------- field types

/**
 * A field's type, in the emitter's vocabulary.
 *
 * These describe rather than compute, which is what keeps a declaration a declaration: `readonly cwd:
 * string` is a description, and there is nowhere in it for a body to hide.
 */
export type FieldType =
  | { readonly kind: 'string' | 'number' | 'boolean' | 'int' | 'unknown' }
  | { readonly kind: 'nonEmptyArray' | 'array'; readonly of: FieldType }
  | { readonly kind: 'ref'; readonly name: string; readonly from?: string }
  | { readonly kind: 'struct'; readonly fields: Readonly<Record<string, FieldType>> }
  | { readonly kind: 'literal'; readonly of: readonly string[] }

/** `S.String`. */
export const str: FieldType = { kind: 'string' }
/** `S.Number`. */
export const num: FieldType = { kind: 'number' }
/** `S.Boolean`. */
export const bool: FieldType = { kind: 'boolean' }
/** `S.Int`. */
export const int: FieldType = { kind: 'int' }
/** `S.Unknown`. */
export const unknown: FieldType = { kind: 'unknown' }

/** `S.Array(of)`. */
export const arrayOf = (of: FieldType): FieldType => ({ kind: 'array', of })
/** `S.NonEmptyArray(of)` — a list whose emptiness is a type error rather than a runtime check. */
export const nonEmptyArrayOf = (of: FieldType): FieldType => ({ kind: 'nonEmptyArray', of })
/** A named schema, imported when `from` is given and local otherwise. */
export const ref = (name: string, from?: string): FieldType =>
  from === undefined ? { kind: 'ref', name } : { kind: 'ref', name, from }
/** `S.Struct({ … })`, nested to whatever depth the payload has. */
export const struct = (fields: Readonly<Record<string, FieldType>>): FieldType => ({ kind: 'struct', fields })
/** `S.Literal(…)` — a closed set, which is what makes a dispatch over it exhaustive. */
export const literal = (...of: readonly string[]): FieldType => ({ kind: 'literal', of })

// ---------------------------------------------------------------- paths and values

/**
 * A read off a value in scope, as the wire form the parser takes.
 *
 * The root is never optional: `command` and every bound name are present by construction, so an
 * optional first hop would emit a check the type checker then rejects as surplus. The parser says so
 * too; this is the same rule stated where the author is looking.
 */
export type PathRef = { readonly path: readonly Segment[] }

/**
 * One hop of a path. A bare name is a required hop; the object form marks one that may be absent.
 *
 * An optional hop emits the optional-chaining the value's own type demands, so marking one that is not
 * optional produces a check `tsc` rejects as surplus — which is why the distinction lives in the
 * declaration rather than being guessed from the shape.
 */
export type Segment = string | { readonly name: string; readonly optional: boolean }

/** A path from a name in scope: `at('verdict', 'reason')` reads `verdict.reason`. */
export const at = (...path: readonly Segment[]): PathRef => ({ path })

/** An optional hop: `at('parsed', 'output', opt('decision'))` reads `parsed.output?.decision`. */
export const opt = (name: string): Segment => ({ name, optional: true })

/** A value a field is built from. */
export type FieldValue =
  | { readonly call: string; readonly from: string; readonly args: readonly PathRef[] }
  | { readonly const: string; readonly from: string }
  | { readonly field: PathRef }

/** A call into a kernel export. The arguments are reads, never expressions — the kernel computes. */
export const callOf = (call: string, from: string, ...args: readonly PathRef[]): FieldValue => ({ call, from, args })
/** An imported constant, named rather than inlined so the cell keeps the import edge. */
export const constOf = (name: string, from: string): FieldValue => ({ const: name, from })
/** A read off a bound value. */
export const read = (...path: readonly string[]): FieldValue => ({ field: { path } })

// ---------------------------------------------------------------- variants and unions

/** One member of a tagged union: its class name, its tag, and its payload. */
export interface Variant {
  readonly class: string
  readonly tag: string
  readonly fields: Readonly<Record<string, FieldType>>
}

/**
 * The brand a union carries.
 *
 * `export: true` where a consumer names the symbol, because it then needs both the value and its type.
 */
export interface TypeId {
  readonly namespace: string
  readonly name: string
  readonly export?: boolean
}

// ---------------------------------------------------------------- dispatch

/** What a dispatch matches on: the command itself, or a value a kernel computes from it. */
export type Subject = 'command' | { readonly call: string; readonly from: string; readonly args: readonly PathRef[] }

/** A dispatch subject computed by a kernel call. */
export const computed = (
  call: string,
  from: string,
  ...args: readonly PathRef[]
): Subject => ({ call, from, args })

/** An arm's pattern: a bare tag, or a field-value object the emitter widens to a discriminator. */
export type Pattern = string | Readonly<Record<string, string | number | boolean>>

/** Building one side of the outcome. `left` is the failure channel, `right` the decision. */
export interface Construction {
  readonly channel: 'left' | 'right'
  readonly construct: string
  readonly with: Readonly<Record<string, FieldValue>>
}

/** A construction arm: this pattern produces this outcome. */
export interface ConstructArm extends Construction {
  readonly pattern: Pattern
}

/**
 * An arm that runs a kernel call returning an `Either` and dispatches on which side came back.
 *
 * The kernel owns the decision; the workflow owns only which outcome each side becomes.
 */
export interface EitherArm {
  readonly pattern: Pattern
  readonly either: {
    readonly call: string
    readonly from: string
    readonly args: readonly PathRef[]
    readonly bind: string
  }
  readonly onLeft: Construction
  readonly onRight: Dispatch | Construction
}

/** An arm whose outcome is itself a dispatch. */
export interface NestedArm {
  readonly pattern: Pattern
  readonly onRight: Dispatch
}

export type Arm = ConstructArm | EitherArm | NestedArm

/**
 * A total dispatch over a closed set.
 *
 * `bind` names the matched value so arms may read fields off it. Without it an arm sees only `command`,
 * which is wrong exactly when the subject computes the value the outcome carries.
 */
export interface Dispatch {
  readonly on: Subject
  readonly bind?: string
  readonly arms: readonly Arm[]
  readonly fallback?: Construction
}

// ---------------------------------------------------------------- the declaration

/** The command a workflow takes: an imported type, or one it declares and brands itself. */
export type Command =
  | { readonly type: string; readonly from: string }
  | { readonly declare: Variant & { readonly typeId?: TypeId } }

/** The decision channel: variants this cell declares, or a union it imports and constructs into. */
export type Decision =
  | {
    readonly variants: readonly Variant[]
    readonly typeId?: TypeId
    /** The exported schema union over the variants, named only when a consumer names it. */
    readonly union?: { readonly name: string }
  }
  | {
    /** A union this cell does not own. It constructs into it and exports nothing of it. */
    readonly imported: { readonly type: string; readonly from: string }
    readonly constructors: readonly string[]
  }

export interface WorkflowDeclaration {
  readonly operation: string
  readonly typeId?: TypeId
  readonly command: Command
  readonly decision: Decision
  readonly error: { readonly variants: readonly Variant[]; readonly typeId?: TypeId }
  /** Exported unions of string literals: a field's literal set, named for consumers. */
  readonly aliases?: readonly { readonly name: string; readonly literals: readonly string[] }[]
  readonly dispatch: Dispatch
}

/**
 * The workflow role constructor.
 *
 * Stamps the brand and the role name. The brand is the emitter's precondition, so a declaration
 * assembled by hand — or by another role's constructor — cannot be emitted as a workflow.
 */
export const workflow = (decl: WorkflowDeclaration): WorkflowDeclaration & { readonly role: 'workflow' } => {
  const branded = { role: 'workflow' as const, ...decl }
  Object.defineProperty(branded, ROLE, { value: 'workflow', enumerable: false })
  return branded
}
