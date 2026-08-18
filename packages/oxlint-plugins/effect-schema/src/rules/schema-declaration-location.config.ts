/** The submodule a namespace import binds the schema vocabulary from. */
export const SCHEMA_MODULE_SOURCE = 'effect/Schema' as const

export const SCHEMA_FILE_SUFFIX = '.schema.ts' as const

/** A workflow file: one stem segment with no periods, then `.workflow.ts`. */
export const WORKFLOW_FILE_BASENAME = /^[^.]+\.workflow\.ts$/

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'module-scope schema declarations only in *.schema.ts (any stem, several per file) or in the owning <stem>.workflow.ts' as const
/**
 * The claim is scoped to what a single file can decide: a schema construction
 * reached from the imported vocabulary by a resolvable path within this file,
 * in a module-scope position that runs at import, must live in a sanctioned
 * file. The "runs at import" wording covers the declaration forms without
 * naming them, so a new block kind cannot open a route by wearing a new name.
 */
export const ACTUAL =
  'a schema declared in a file that is neither *.schema.ts nor a single-segment <stem>.workflow.ts, in a module-scope position that runs at import' as const
export const FIX =
  'move it to <stem>.schema.ts or into the *.workflow.ts that owns it and import it; a schema only a test uses belongs in tests/__fixtures__/<stem>.schema.ts' as const

/**
 * The one reported can't-decide, requiring positive evidence: a module-scope
 * member or call chain whose BASE positively resolves to the Schema
 * vocabulary — the `Schema` namespace, an alias of it, or a value the
 * classifier already labels `vocabulary` (a spread copy, an `Object.assign`
 * result, a coalesce with a vocabulary arm) — and whose member, key, or
 * intermediate hop alone could not be determined. There a schema IS being
 * produced; only the path cannot be named, which is the shape a smuggling
 * route needs. The message claims exactly this and nothing else.
 */
export const UNRESOLVED_EXPECTED =
  'a module-scope binding whose initializer the rule can resolve to a definite schema or a definite non-schema' as const
export const UNRESOLVED_ACTUAL =
  'a member or call chain on a base that positively resolves to the Schema vocabulary (the Schema namespace, an alias of it, or a vocabulary-valued handle), where the member, key or intermediate hop could not be statically determined — so the binding MAY hold a schema' as const
export const UNRESOLVED_FIX =
  'declare the schema in <stem>.schema.ts or the owning <stem>.workflow.ts, or make the chain statically resolvable: access the vocabulary through a literal member key instead of a computed one' as const

/**
 * The rule's boundary, stated as a non-decision rather than silence: a value
 * whose relationship to the vocabulary cannot be established in this file —
 * a chain rooted in a binding of no vocabulary connection, a curried factory,
 * a call into another module, a parameter, or a value laundered out of the
 * file's resolvable reach — is whole-program dataflow a single-file lint rule
 * cannot decide. That surface is LEFT TO REVIEW, not claimed: the message
 * above never asserts it covers a chain whose base did not positively resolve
 * to the Schema vocabulary. Irresolution is not evidence; a report fires only
 * on a vocabulary base that is known.
 */

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Module-scope Effect Schema declarations live only in *.schema.ts files (any stem, several per file) or in the <stem>.workflow.ts file that owns them.',
  },
  schema: [],
  messages: {
    schemaOutsideSchemaFile: MESSAGE,
    unresolvedSchemaChain: MESSAGE,
  },
} as const