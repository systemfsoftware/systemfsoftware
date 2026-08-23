import { behaviourExercisesUseCase } from './rules/behaviour-exercises-use-case.js'
import { behaviourOneFeaturePerFile } from './rules/behaviour-one-feature-per-file.js'
import { behaviourTestRequiresGherkin } from './rules/behaviour-test-requires-gherkin.js'
import { inSourceTestTargetsPrivate } from './rules/in-source-test-targets-private.js'
import { noIoModuleInSourceTest } from './rules/no-io-module-in-source-test.js'
import { noTestFileInSrc } from './rules/no-test-file-in-src.js'
import { srcPropertyTestCell } from './rules/src-property-test-cell.js'
import { testFileOutsideTestsDir } from './rules/test-file-outside-tests-dir.js'
import { testSuffixOutsideSrc } from './rules/test-suffix-outside-src.js'
import { testsDirHelpersInFixtures } from './rules/tests-dir-helpers-in-fixtures.js'
import { testsImportPublicApi } from './rules/tests-import-public-api.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-test-placement'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('in-source-test-targets-private')]: 'error',
  [rule('no-test-file-in-src')]: 'error',
  [rule('src-property-test-cell')]: 'error',
  [rule('test-file-outside-tests-dir')]: 'error',
  [rule('test-suffix-outside-src')]: 'error',
  [rule('behaviour-test-requires-gherkin')]: 'error',
  [rule('behaviour-exercises-use-case')]: 'error',
  [rule('behaviour-one-feature-per-file')]: 'error',
  [rule('tests-dir-helpers-in-fixtures')]: 'error',
  [rule('no-io-module-in-source-test')]: 'error',
  [rule('tests-import-public-api')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'in-source-test-targets-private': inSourceTestTargetsPrivate,
    'no-test-file-in-src': noTestFileInSrc,
    'src-property-test-cell': srcPropertyTestCell,
    'test-file-outside-tests-dir': testFileOutsideTestsDir,
    'test-suffix-outside-src': testSuffixOutsideSrc,
    'behaviour-test-requires-gherkin': behaviourTestRequiresGherkin,
    'behaviour-exercises-use-case': behaviourExercisesUseCase,
    'behaviour-one-feature-per-file': behaviourOneFeaturePerFile,
    'tests-dir-helpers-in-fixtures': testsDirHelpersInFixtures,
    'no-io-module-in-source-test': noIoModuleInSourceTest,
    'tests-import-public-api': testsImportPublicApi,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
