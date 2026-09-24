import { banRawSpanNameEmit } from './rules/ban-raw-span-name-emit.js'
import { behaviourExercisesUseCase } from './rules/behaviour-exercises-use-case.js'
import { behaviourOneFeaturePerFile } from './rules/behaviour-one-feature-per-file.js'
import { behaviourTestRequiresGherkin } from './rules/behaviour-test-requires-gherkin.js'
import { dampTestNaming } from './rules/damp-test-naming.js'
import { differentialTestRequiresHarness } from './rules/differential-test-requires-harness.js'
import { expectBooleanPredicate } from './rules/expect-boolean-predicate.js'
import { expectFromEffectVitest } from './rules/expect-from-effect-vitest.js'
import { inSourceTestPropOnly } from './rules/in-source-test-prop-only.js'
import { inSourceTestTargetsPrivate } from './rules/in-source-test-targets-private.js'
import { noAssertInProperty } from './rules/no-assert-in-property.js'
import { noBehaviourlessAssertion } from './rules/no-behaviourless-assertion.js'
import { noIoModuleInSourceTest } from './rules/no-io-module-in-source-test.js'
import { noNestedQuantification } from './rules/no-nested-quantification.js'
import { noPseudoGherkinUnitTests } from './rules/no-pseudo-gherkin-unit-tests.js'
import { noSilentReturn } from './rules/no-silent-return.js'
import { noTestFileInSrc } from './rules/no-test-file-in-src.js'
import { pbtNaming } from './rules/pbt-naming.js'
import { propArbitrarySchemaOrigin } from './rules/prop-arbitrary-schema-origin.js'
import { propFixtureSchemaOrigin } from './rules/prop-fixture-schema-origin.js'
import { propGeneratedLawDuplicate } from './rules/prop-generated-law-duplicate.js'
import { propertyFilePurity } from './rules/property-file-purity.js'
import { srcPropertyTestCell } from './rules/src-property-test-cell.js'
import { testFileOutsideTestsDir } from './rules/test-file-outside-tests-dir.js'
import { testSuffixOutsideSrc } from './rules/test-suffix-outside-src.js'
import { testsDirHelpersInFixtures } from './rules/tests-dir-helpers-in-fixtures.js'
import { testsImportPublicApi } from './rules/tests-import-public-api.js'
import { traceTestRequiresTaxonomy } from './rules/trace-test-requires-taxonomy.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-test-discipline'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('damp-test-naming')]: 'error',
  [rule('no-behaviourless-assertion')]: 'error',
  [rule('pbt-naming')]: 'error',
  [rule('no-silent-return')]: 'error',
  [rule('no-assert-in-property')]: 'error',
  [rule('property-file-purity')]: 'error',
  [rule('no-nested-quantification')]: 'error',
  [rule('prop-arbitrary-schema-origin')]: 'error',
  [rule('prop-fixture-schema-origin')]: 'error',
  [rule('prop-generated-law-duplicate')]: 'error',
  [rule('in-source-test-prop-only')]: 'error',
  [rule('in-source-test-targets-private')]: 'error',
  [rule('no-test-file-in-src')]: 'error',
  [rule('src-property-test-cell')]: 'error',
  [rule('test-file-outside-tests-dir')]: 'error',
  [rule('test-suffix-outside-src')]: 'error',
  [rule('behaviour-test-requires-gherkin')]: 'error',
  [rule('behaviour-exercises-use-case')]: 'error',
  [rule('behaviour-one-feature-per-file')]: 'error',
  [rule('tests-dir-helpers-in-fixtures')]: 'error',
  [rule('expect-boolean-predicate')]: 'error',
  [rule('expect-from-effect-vitest')]: 'error',
  [rule('no-io-module-in-source-test')]: 'error',
  [rule('tests-import-public-api')]: 'error',
  [rule('differential-test-requires-harness')]: 'error',
  [rule('no-pseudo-gherkin-unit-tests')]: 'error',
  [rule('ban-raw-span-name-emit')]: 'error',
  [rule('trace-test-requires-taxonomy')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'damp-test-naming': dampTestNaming,
    'no-behaviourless-assertion': noBehaviourlessAssertion,
    'pbt-naming': pbtNaming,
    'no-silent-return': noSilentReturn,
    'no-assert-in-property': noAssertInProperty,
    'property-file-purity': propertyFilePurity,
    'no-nested-quantification': noNestedQuantification,
    'prop-generated-law-duplicate': propGeneratedLawDuplicate,
    'prop-arbitrary-schema-origin': propArbitrarySchemaOrigin,
    'prop-fixture-schema-origin': propFixtureSchemaOrigin,
    'in-source-test-prop-only': inSourceTestPropOnly,
    'in-source-test-targets-private': inSourceTestTargetsPrivate,
    'no-test-file-in-src': noTestFileInSrc,
    'src-property-test-cell': srcPropertyTestCell,
    'test-file-outside-tests-dir': testFileOutsideTestsDir,
    'test-suffix-outside-src': testSuffixOutsideSrc,
    'behaviour-test-requires-gherkin': behaviourTestRequiresGherkin,
    'behaviour-exercises-use-case': behaviourExercisesUseCase,
    'behaviour-one-feature-per-file': behaviourOneFeaturePerFile,
    'no-pseudo-gherkin-unit-tests': noPseudoGherkinUnitTests,
    'tests-dir-helpers-in-fixtures': testsDirHelpersInFixtures,
    'expect-boolean-predicate': expectBooleanPredicate,
    'expect-from-effect-vitest': expectFromEffectVitest,
    'no-io-module-in-source-test': noIoModuleInSourceTest,
    'tests-import-public-api': testsImportPublicApi,
    'differential-test-requires-harness': differentialTestRequiresHarness,
    'ban-raw-span-name-emit': banRawSpanNameEmit,
    'trace-test-requires-taxonomy': traceTestRequiresTaxonomy,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
