import { MESSAGE } from './path.config.js'

export const REACH_IN_EXPECTED = 'a package name or subpath, or a sibling helper under the test tree'
export const REACH_IN_ACTUAL = 'a relative import that reaches src or climbs into an internal folder'
export const REACH_IN_FIX =
  'rewrite onto the published package name when the binding is public. Delete the test when the subject is an internal'

export const meta = {
  type: 'problem',
  docs: {
    description: 'Forbid package-level tests from relative-importing src or climbing into an internal folder',
  },
  schema: [],
  messages: {
    sourceReachIn: MESSAGE,
  },
} as const
