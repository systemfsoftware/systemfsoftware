export const SCOPE_SYMBOLS = new Set(['∀', '∃', '→', '¬', '≤', '≥'])

export const PREDICATE_SYMBOLS = new Set([
  '≡',
  '≠',
  '=',
  '≤',
  '≥',
  '∈',
  '⊆',
  '⊇',
  '→',
  '¬',
  '∘',
  '∩',
  '∪',
  '⊥',
])

export const NULLARY_PREDICATE_SYMBOLS = new Set(['⊥'])

export const PASCAL_CASE = /^[A-Z][a-z][a-zA-Z0-9]*$/
export const DAMP_WORDS = /When|Should|Given|Then|Otherwise|After|Before/

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Enforce a complete formal-specification name for property-based tests (it.prop / it.effect.prop). ' +
      'Format: [ScopeSymbol][binder]_[Domain]_[PredicateSymbol][operand] ' +
      '(e.g., ∀x_DecodeEncode_=x, ∀l_Filter_⊆Input, →Shipped_Cancel_⊥Allowed). ' +
      'Both the quantifier and the predicate must carry an operand — a bare symbol specifies nothing.',
  },
  schema: [],
  messages: {
    invalidSegments: 'Expected: exactly 2 underscores in PBT name ([Scope]_[Domain]_[Predicate]). ' +
      'Actual: name "{{actual}}" has {{count}} separator(s). ' +
      "If this isn't a universal invariant, delete the test. " +
      'Otherwise use format [ScopeSymbol][binder]_[Domain]_[PredicateSymbol][operand] (e.g., ∀x_DecodeEncode_=x).',
    invalidScopeSymbol: 'Expected: a quantifier symbol (∀ ∃ → ¬ ≤ ≥) at the start of "{{actual}}". ' +
      'Actual: it starts with "{{firstChar}}". ' +
      "If this isn't a universal invariant, delete the test. " +
      'Otherwise quantify the input: ∀ (for all), ∃ (there exists), → (implies), ¬, ≤, ≥.',
    incompleteScope: 'Expected: a bound variable after the quantifier "{{symbol}}" in scope segment "{{scope}}" ' +
      '(e.g., ∀x, ∀order, ∃e, →Shipped). ' +
      'A property quantifies over a named input drawn from a generator; name it. ' +
      'A lone quantifier binds nothing and specifies no domain.',
    emptyDomain: 'Expected: a non-empty PascalCase domain between the two underscores in "{{actual}}". ' +
      "If this isn't a universal invariant, delete the test. " +
      'Otherwise name the thing under test, e.g., ∀x_DecodeEncode_=x.',
    domainLeaksDAMP: 'Expected: an invariant domain, not scenario language. ' +
      'Actual: domain "{{domain}}" contains "{{word}}" — that describes one case, not a universal law. ' +
      'Delete this test. It is not a property. Find the actual invariant and write that instead.',
    invalidPredicateSymbol:
      'Expected: a relation symbol (≡ ≠ = ≤ ≥ ∈ ⊆ ⊇ → ¬ ∘ ∩ ∪ ⊥) starting the last segment of "{{actual}}". ' +
      'Actual: it ends with "{{firstChar}}". ' +
      "If this isn't a universal invariant, delete the test. " +
      'Otherwise relate the output: = / ≡ (roundtrip or oracle), ⊆ / ∈ (invariant), ≠ (distinctness), ⊥ (impossibility).',
    incompletePredicate: 'Expected: an operand after the relation symbol "{{symbol}}" in predicate "{{predicate}}", ' +
      'naming what the output is related to: =x / ≡Oracle (roundtrip or reference), ⊆Input / ∈Ignored (invariant), ' +
      '≠Zero (distinctness), ⊥Cancellable (impossibility — name the outcome that cannot occur). ' +
      'A bare symbol relates the output to nothing and so asserts no property.',
  },
} as const
