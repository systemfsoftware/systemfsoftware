import { behaviourExercisesUseCase } from './rules/behaviour-exercises-use-case.js'
import { behaviourOneFeaturePerFile } from './rules/behaviour-one-feature-per-file.js'
import { behaviourTestRequiresGherkin } from './rules/behaviour-test-requires-gherkin.js'
import { noTestFileInSrc } from './rules/no-test-file-in-src.js'
import { srcPropertyTestCell } from './rules/src-property-test-cell.js'
import { testFileOutsideTestsDir } from './rules/test-file-outside-tests-dir.js'
import { testSuffixOutsideSrc } from './rules/test-suffix-outside-src.js'
import { testsDirHelpersInFixtures } from './rules/tests-dir-helpers-in-fixtures.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-test-placement'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('no-test-file-in-src')]: 'error',
  [rule('src-property-test-cell')]: 'error',
  [rule('test-file-outside-tests-dir')]: 'error',
  [rule('test-suffix-outside-src')]: 'error',
  [rule('behaviour-test-requires-gherkin')]: 'error',
  [rule('behaviour-exercises-use-case')]: 'error',
  [rule('behaviour-one-feature-per-file')]: 'error',
  [rule('tests-dir-helpers-in-fixtures')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'no-test-file-in-src': noTestFileInSrc,
    'src-property-test-cell': srcPropertyTestCell,
    'test-file-outside-tests-dir': testFileOutsideTestsDir,
    'test-suffix-outside-src': testSuffixOutsideSrc,
    'behaviour-test-requires-gherkin': behaviourTestRequiresGherkin,
    'behaviour-exercises-use-case': behaviourExercisesUseCase,
    'behaviour-one-feature-per-file': behaviourOneFeaturePerFile,
    'tests-dir-helpers-in-fixtures': testsDirHelpersInFixtures,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
