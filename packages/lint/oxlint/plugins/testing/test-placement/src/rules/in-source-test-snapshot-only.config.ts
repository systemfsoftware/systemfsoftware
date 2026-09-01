import { MESSAGE } from './path.config.js'

export const PROPERTY_BAN_NAME = 'Hand-written property construct in an in-source test block' as const
export const PROPERTY_BAN_EXPECTED =
  "property tests only at the workflow's exported contract, and in-source blocks via the generated ruleOfSchemas(...) channel" as const
export const PROPERTY_BAN_ACTUAL =
  'hand-written it.prop / test.prop / it.effect.prop / FastCheck / fc / Arbitrary / fast-check import inside an `if (import.meta.vitest)` block' as const
export const PROPERTY_BAN_FIX =
  "delete the hand-written property construct from the in-source block — move property coverage to the workflow's <stem>.workflow.property.test.ts contract or rely on generated schema laws; if the case defends nothing, delete it" as const

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
export const NO_EMPTY_PLACEHOLDER_ACTUAL = 'toMatchInlineSnapshot() with no argument — a capture placeholder' as const
export const NO_EMPTY_PLACEHOLDER_FIX =
  'author the expected snapshot content inline, or delete the placeholder when the case is not worth pinning — capture-then-commit is not allowed' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Inside an `if (import.meta.vitest)` block in a src/ module, the only hand-written assertions are authored expect(...).toMatchInlineSnapshot(...) literals; property constructs (it.prop, FastCheck/fc/Arbitrary, fast-check imports), every other assertion terminal (expectTypeOf, node:assert, throw), and empty snapshot placeholders are banned — ruleOfSchemas(...) generated-law calls are exempt.',
  },
  schema: [],
  messages: {
    propertyBan: MESSAGE,
    snapshotOnly: MESSAGE,
    noEmptyPlaceholder: MESSAGE,
  },
} as const
