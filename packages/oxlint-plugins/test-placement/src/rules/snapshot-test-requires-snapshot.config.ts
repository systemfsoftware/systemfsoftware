import { MESSAGE } from './path.config.js'

export const MISSING_SNAPSHOT_NAME = 'a *.snapshot.test.ts with no snapshot assertion' as const
export const MISSING_SNAPSHOT_EXPECTED =
  'at least one of toMatchSnapshot, toMatchInlineSnapshot, toMatchFileSnapshot, or toThrowErrorMatchingSnapshot' as const
export const MISSING_SNAPSHOT_ACTUAL =
  'a snapshot file that imports nothing and asserts nothing — it tests no shape' as const
export const MISSING_SNAPSHOT_FIX =
  'the file name promises a snapshot; the body must keep that promise. Add `toMatchSnapshot(...)` against a fixed-seed fc.sample(...) result. If the file is actually a behaviour test, rename it to *.integration.test.ts and route the assertion through @systemfsoftware/effect-gherkin-spec; if it is actually a property test, move it to src/ as *.property.test.ts beside the cell whose arbitrary it samples. A snapshot file that pins nothing is deleted.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.snapshot.test.ts file must contain at least one snapshot assertion (toMatchSnapshot, toMatchInlineSnapshot, toMatchFileSnapshot, or toThrowErrorMatchingSnapshot). The suffix admits a kind exempt from the four behaviour-* rules, so it is itself constrained: the file must actually pin something against a stored fixture.',
  },
  schema: [],
  messages: {
    missingSnapshot: MESSAGE,
  },
} as const
