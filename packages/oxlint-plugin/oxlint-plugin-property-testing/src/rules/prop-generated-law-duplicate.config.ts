export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const COMPILER_NAME = 'a runtime probe of a compile-time guarantee' as const

export const COMPILER_EXPECTED =
  'the type checker owns brand and nominal-identity contracts — a dropped brand is a compile error at the consumer brand gate, not a failing property' as const

export const COMPILER_ACTUAL =
  'the predicate reflects over brand symbols at runtime, so it re-asserts what tsc already enforces and passes whenever the type system passes' as const

export const COMPILER_FIX =
  'delete the prop; state the brand contract where the compiler reads it — an expectTypeOf assertion or the consuming signature — never a symbol reflection loop' as const

export const NO_FUNCTION_NAME = 'a property that tests no function' as const

export const NO_FUNCTION_EXPECTED =
  'every in-source property exercises domain logic — at least one call to a module-local function that is not a schema codec accessor — because a predicate that only feeds values through encode or decode tests the schema declaration, not code, and decode acceptance and refusal alike are generated or declared elsewhere' as const

export const NO_FUNCTION_ACTUAL =
  'no call in the predicate reaches module code — every call is a codec accessor, a schema wrapper, or an iteration combinator — so the property cannot fail unless the declaration it restates changes meaning' as const

export const NO_FUNCTION_FIX =
  'delete the prop; test the function that owns the decision — the workflow or a private helper in this module — with its input derived from a domain schema' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Inside an import.meta.vitest in-source block: a predicate that reflects over brand symbols re-asserts a compile-time guarantee, and a predicate containing no module-local non-codec function call tests a schema declaration instead of code. Both report.',
  },
  schema: [],
  messages: {
    compilerDuplicate: MESSAGE,
    noDomainFunction: MESSAGE,
  },
} as const
