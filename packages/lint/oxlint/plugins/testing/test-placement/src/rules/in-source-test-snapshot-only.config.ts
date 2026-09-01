import { MESSAGE } from './path.config.js'

export const PROPERTY_BAN_NAME = 'Hand-written property construct in an in-source test block' as const
export const PROPERTY_BAN_EXPECTED =
  "property tests only at the workflow's exported contract, and in-source blocks via the generated ruleOfSchemas(...) channel" as const
export const PROPERTY_BAN_ACTUAL =
  'hand-written it.prop / test.prop / it.effect.prop / FastCheck / fc / Arbitrary / fast-check or FastCheck-destructuring effect/testing import inside an `if (import.meta.vitest)` block' as const
export const PROPERTY_BAN_FIX =
  'delete the hand-written property construct from the in-source block. When the source file is a workflow (its basename ends .workflow.ts), property coverage may move to its colocated <stem>.workflow.property.test.ts — every other stem has no property-test home under src/ (no-test-file-in-src rejects it), so delete. Generated schema laws (ruleOfSchemas(...)) already cover codec round-trips; a refusal case they cannot express is pinned as an authored inline snapshot' as const

export const SNAPSHOT_ONLY_NAME = 'Non-snapshot assertion in an in-source test block' as const
export const SNAPSHOT_ONLY_EXPECTED =
  'every assertion in the block to be expect(...).toMatchInlineSnapshot(...) with authored expected content' as const
export const SNAPSHOT_ONLY_ACTUAL =
  'an assertion whose terminal is not toMatchInlineSnapshot — or expectTypeOf / node:assert / throw-as-assertion' as const
export const SNAPSHOT_ONLY_FIX =
  'author the expected value as an inline snapshot literal, or delete the case — an assertion that restates what the adjacent code computes is a change detector and is deleted, not rehoused' as const

export const NO_EMPTY_PLACEHOLDER_NAME = 'Empty toMatchInlineSnapshot() placeholder in an in-source test block' as const
export const NO_EMPTY_PLACEHOLDER_EXPECTED =
  'an authored inline snapshot literal inside expect(...).toMatchInlineSnapshot(...)' as const
export const NO_EMPTY_PLACEHOLDER_ACTUAL =
  'toMatchInlineSnapshot() with no argument, or one whose template literal interpolates runtime values — captured, not authored' as const
export const NO_EMPTY_PLACEHOLDER_FIX =
  'author the expected snapshot content inline as a literal with no ${...} interpolation, or delete the placeholder when the case is not worth pinning — capture-then-commit is not allowed' as const

export const GUARD_FORM_NAME = 'Non-canonical in-source test guard' as const
export const GUARD_FORM_EXPECTED =
  'the guard to be exactly `if (import.meta.vitest)` or `if (import.meta.vitest !== void 0)` at statement level' as const
export const GUARD_FORM_ACTUAL =
  'import.meta.vitest referenced outside an if-statement test — a short-circuit, ternary, negated, or bound form' as const
export const GUARD_FORM_FIX =
  'rewrite as a top-level if (import.meta.vitest) block — a short-circuit, ternary, or inverted guard still runs under vitest includeSource but registers no in-source block, so its contents evade every in-source test rule' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Inside an `if (import.meta.vitest)` block in a non-test src/ module, the only hand-written assertions are authored expect(...).toMatchInlineSnapshot(...) literals; hand-written property constructs (it.prop, FastCheck/fc/Arbitrary, fast-check or FastCheck-destructuring effect/testing imports), every other assertion terminal (expectTypeOf, node:assert, throw-as-assertion), empty or computed snapshot placeholders, and non-canonical guard forms (short-circuit, ternary, inverted) are banned — ruleOfSchemas(...) generated-law calls are exempt.',
  },
  schema: [],
  messages: {
    propertyBan: MESSAGE,
    snapshotOnly: MESSAGE,
    noEmptyPlaceholder: MESSAGE,
    guardForm: MESSAGE,
  },
} as const
