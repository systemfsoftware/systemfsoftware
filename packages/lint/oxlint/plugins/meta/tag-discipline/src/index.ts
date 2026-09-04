import { noBodylessStatusAssertion } from './rules/no-bodyless-status-assertion.js'
import { noContextGenericTag } from './rules/no-context-generic-tag.js'
import { noDirectTagAccess } from './rules/no-direct-tag-access.js'
import { noEitherTagAssertions } from './rules/no-either-tag-assertions.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-tag-discipline'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

/**
 * `no-bodyless-status-assertion` ships in `rules` but is deliberately absent
 * here: it needs a status-assertion vocabulary that only some packages have.
 * A consumer enables it by name; recommending it would fire on their first file.
 */
const recommendedRules = {
  [rule('no-context-generic-tag')]: 'error',
  [rule('no-direct-tag-access')]: 'error',
  [rule('no-either-tag-assertions')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'no-bodyless-status-assertion': noBodylessStatusAssertion,
    'no-context-generic-tag': noContextGenericTag,
    'no-direct-tag-access': noDirectTagAccess,
    'no-either-tag-assertions': noEitherTagAssertions,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
