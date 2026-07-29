import { featureTestRequiresGherkin } from './rules/feature-test-requires-gherkin.js'
import { inSourceTestTargetsPrivate } from './rules/in-source-test-targets-private.js'
import { noTestFileInSrc } from './rules/no-test-file-in-src.js'
import { srcPropertyTestCell } from './rules/src-property-test-cell.js'
import { testFileOutsideTestsDir } from './rules/test-file-outside-tests-dir.js'
import { testSuffixOutsideSrc } from './rules/test-suffix-outside-src.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-test-placement'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('no-test-file-in-src')]: 'error',
  [rule('src-property-test-cell')]: 'error',
  [rule('in-source-test-targets-private')]: 'error',
  [rule('test-file-outside-tests-dir')]: 'error',
  [rule('test-suffix-outside-src')]: 'error',
  [rule('feature-test-requires-gherkin')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'no-test-file-in-src': noTestFileInSrc,
    'src-property-test-cell': srcPropertyTestCell,
    'in-source-test-targets-private': inSourceTestTargetsPrivate,
    'test-file-outside-tests-dir': testFileOutsideTestsDir,
    'test-suffix-outside-src': testSuffixOutsideSrc,
    'feature-test-requires-gherkin': featureTestRequiresGherkin,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
