import plugin from '@systemfsoftware/oxlint-plugin-test-discipline'
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { LANE_MISMATCH_ACTUAL, LANE_MISMATCH_FIX } from '../test-suffix-outside-src.config.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const root = join(mkdtempSync(join(tmpdir(), 'e2e-tier-placement-')), 'node_modules', 'checkout')

const write = (path: string, text: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

const link = (path: string, target: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  symlinkSync(join(root, target), join(root, path))
}

const installed = (name: string): void => {
  const store = `node_modules/.pnpm/${name.replace('/', '+')}@1.0.0/node_modules/${name}`
  write(`${store}/package.json`, JSON.stringify({ name }))
  link(`node_modules/${name}`, store)
}

write('packages/core/package.json', JSON.stringify({ name: '@example/core', exports: { '.': './src/index.ts' } }))
write('packages/core/src/index.ts', 'export const total = 1\n')
write('packages/core/tests/__fixtures__/reaching.ts', "export * from '../../src/index.ts'\n")
write('packages/core/tests/__fixtures__/driving.ts', "export { chromium } from 'example-driver'\n")
write('packages/gherkin/package.json', JSON.stringify({ name: '@systemfsoftware/effect-gherkin-spec', exports: {} }))
write('packages/gherkin/src/index.ts', 'export const makeFeature = 1\n')
write('apps/shop-e2e/package.json', JSON.stringify({ name: '@example/shop-e2e', private: true }))
write('apps/shop-e2e/tests/__fixtures__/stack.ts', "export { chromium } from 'example-driver'\n")
write('apps/shop-e2e/tests/__fixtures__/leaky.ts', "export { total } from '@example/core'\n")
write('apps/shop-e2e/tests/__fixtures__/order.json', '{}')
write('apps/broken/package.json', '{ not json')
write('packages/core/tests/sneak/package.json', '{}')
write('apps/shop-e2e/tests/__fixtures__/locked.ts', "export { chromium } from 'example-driver'\n")
chmodSync(join(root, 'apps/shop-e2e/tests/__fixtures__/locked.ts'), 0)
installed('example-driver')
write(
  'node_modules/.pnpm/example-runner@1.0.0/node_modules/example-runner/package.json',
  JSON.stringify({ name: 'example-runner' }),
)
link('apps/shop-e2e/node_modules/example-runner', 'node_modules/.pnpm/example-runner@1.0.0/node_modules/example-runner')
installed('@systemfsoftware/effect-gherkin-spec')
link('node_modules/@example/core', 'packages/core')
write('apps/harness-e2e/package.json', JSON.stringify({ name: '@example/harness-e2e', private: true }))
link('apps/harness-e2e/node_modules/@systemfsoftware/effect-gherkin-spec', 'packages/gherkin')

const at = (path: string): string => join(root, path)

const GHERKIN = `import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'\n`
const DRIVER = `import { chromium } from 'example-driver'\n`
const JOURNEY = at('apps/shop-e2e/tests/buying.e2e.ts')
const INTEGRATION = at('packages/core/tests/total.integration.test.ts')

const error = (messageId: string) => ({ messageId })

ruleTester.run('e2e-tier-placement', plugin.rules['e2e-tier-placement'], {
  valid: [
    {
      name: 'Should_Pass_When_AnE2eFeatureDrivesTheSystemThroughRegistryPackagesAndLocalFixtures',
      code: `${GHERKIN}${DRIVER}import { stack } from './__fixtures__/stack.ts'\n`,
      filename: JOURNEY,
    },
    {
      name: 'Should_Pass_When_AnE2eFeatureReadsADataFileInItsTests',
      code: `${GHERKIN}import order from './__fixtures__/order.json'\n`,
      filename: JOURNEY,
    },
    {
      name: 'Should_Pass_When_AnIntegrationFeatureImportsItsOwnSource',
      code: `${GHERKIN}import { total } from '../src/index.ts'\n`,
      filename: INTEGRATION,
    },
    {
      name: 'Should_Pass_When_AFeatureReachesWorkspaceCodeInAPackageThatShipsNothing',
      code: `${GHERKIN}import { total } from '@example/core'\n`,
      filename: at('apps/shop-e2e/tests/total.integration.test.ts'),
    },
    {
      name: 'Should_Pass_When_AnE2eFeatureImportsAPackageItsOwnNodeModulesLinksToTheRootStore',
      code: `${GHERKIN}import { run } from 'example-runner'\n`,
      filename: JOURNEY,
    },
    {
      name: 'Should_Pass_When_AnE2eFeatureImportsAnUnprefixedNodeBuiltin',
      code: `${GHERKIN}import { readFileSync } from 'fs'\n`,
      filename: JOURNEY,
    },
    {
      name: 'Should_Pass_When_AnE2eFeatureIsJudgedInAPackageLinkedFromAnotherCheckoutsNodeModules',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('apps/shop-e2e/tests/checkout.e2e.ts'),
    },
    {
      name: 'Should_Pass_When_ThePackageManifestDoesNotParse',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('apps/broken/tests/buying.e2e.ts'),
    },
    {
      name: 'Should_Pass_When_TheFileHasNoPackageToJudge',
      code: GHERKIN,
      filename: '/nowhere/pkg/tests/x.e2e.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_RefuseAnE2eLookalike_When_ItIsUnderSrc',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('packages/core/src/buying.e2e.test.ts'),
      errors: [error('e2eOutsideTests')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ANestedManifestUnderTestsClaimsToShipNothing',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('packages/core/tests/sneak/buying.e2e.ts'),
      errors: [error('e2eOutsideE2ePackage')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItReExportsATypeOfAWorkspacePackage',
      code: `${GHERKIN}export type { Total } from '@example/core'\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFile_When_ItIsOutsideTests',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('apps/shop-e2e/stack/buying.e2e.ts'),
      errors: [error('e2eOutsideTests')],
    },
    {
      name: 'Should_RefuseAnE2eFile_When_ItIsAFixture',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('apps/shop-e2e/tests/__fixtures__/buying.e2e.ts'),
      errors: [error('e2eOutsideTests')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItsPackageShipsCode',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('packages/core/tests/buying.e2e.ts'),
      errors: [error('e2eOutsideE2ePackage')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItTypeImportsAWorkspacePackage',
      code: `${GHERKIN}import type { total } from '@example/core'\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItTypeImportsAnotherPackagesSourceByPath',
      code: `${GHERKIN}import type { total } from '../../../packages/core/src/index.ts'\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
  ],
})

const suffix = (filename: string, code: string, expected: string) => ({
  code,
  filename,
  errors: [{
    messageId: 'laneMismatch',
    data: { name: filename.split('/').at(-1), expected, actual: LANE_MISMATCH_ACTUAL, fix: LANE_MISMATCH_FIX },
  }],
})

ruleTester.run('test-suffix-outside-src, judged on disk', plugin.rules['test-suffix-outside-src'], {
  valid: [
    {
      name: 'Should_NameItE2e_When_AFeatureImportsAPackageItsOwnNodeModulesLinksToTheRootStore',
      code: `${GHERKIN}import { run } from 'example-runner'\n`,
      filename: JOURNEY,
    },
    {
      name: 'Should_IgnoreALeftoverE2eRole_When_TheFeatureReachesNothingOfOurs',
      code: `${GHERKIN}${DRIVER}`,
      filename: JOURNEY,
      settings: { '@systemfsoftware/oxlint-plugin-test-discipline': { role: 'e2e' } },
    },
    { name: 'Should_NameItE2e_When_AFeatureReachesNothingOfOurs', code: `${GHERKIN}${DRIVER}`, filename: JOURNEY },
    {
      name: 'Should_NameItIntegration_When_AFeatureReachesItsSourceThroughAFixture',
      code: `${GHERKIN}import { total } from './__fixtures__/reaching.ts'\n`,
      filename: INTEGRATION,
    },
    {
      name: 'Should_NameItIntegration_When_AFeatureImportsItsOwnPackageByName',
      code: `${GHERKIN}import { total } from '@example/core'\n`,
      filename: INTEGRATION,
    },
  ],
  invalid: [
    {
      name: 'Should_RefuseAnE2eFile_When_ItIsNoFeature',
      code: DRIVER,
      filename: JOURNEY,
      errors: [{ messageId: 'noLane' }],
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureRequiresThroughAnAliasedCreateRequire',
      ...suffix(
        JOURNEY,
        `${GHERKIN}import { createRequire } from 'node:module'\nconst load = createRequire(import.meta.url)\nconst core = load('@example/core')\n`,
        '.integration.test.ts',
      ),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureLoadsTheModuleBuiltinAtRuntime',
      ...suffix(JOURNEY, `${GHERKIN}const loader = process.getBuiltinModule('node:module')\n`, '.integration.test.ts'),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AFixtureAnE2eFeatureImportsCannotBeRead',
      ...suffix(JOURNEY, `${GHERKIN}import { chromium } from './__fixtures__/locked.ts'\n`, '.integration.test.ts'),
    },
    {
      name: 'Should_AskForTheE2eName_When_AnIntegrationFeatureImportsOnlyRegistryPackages',
      ...suffix(INTEGRATION, `${GHERKIN}${DRIVER}`, '.e2e.ts'),
    },
    {
      name: 'Should_AskForTheE2eName_When_AnIntegrationFeaturesFixturesReachOnlyRegistryPackages',
      ...suffix(INTEGRATION, `${GHERKIN}import { chromium } from './__fixtures__/driving.ts'\n`, '.e2e.ts'),
    },
    {
      name: 'Should_AskForTheE2eName_When_AnIntegrationFeatureReachesOurCodeOnlyAsATypeImport',
      ...suffix(INTEGRATION, `${GHERKIN}import type { total } from '@example/core'\n`, '.e2e.ts'),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_TheGherkinHarnessItselfIsAWorkspacePackage',
      ...suffix(at('apps/harness-e2e/tests/buying.e2e.ts'), `${GHERKIN}${DRIVER}`, '.integration.test.ts'),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureImportsAWorkspacePackage',
      ...suffix(JOURNEY, `${GHERKIN}import { total } from '@example/core'\n`, '.integration.test.ts'),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureImportsAnotherPackagesSourceByPath',
      ...suffix(
        JOURNEY,
        `${GHERKIN}import { total } from '../../../packages/core/src/index.ts'\n`,
        '.integration.test.ts',
      ),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureUsesASubpathImport',
      ...suffix(JOURNEY, `${GHERKIN}import { total } from '#core'\n`, '.integration.test.ts'),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureDynamicallyImportsAWorkspacePackage',
      ...suffix(JOURNEY, `${GHERKIN}const core = await import('@example/core')\n`, '.integration.test.ts'),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureDynamicallyImportsAComputedTarget',
      ...suffix(
        JOURNEY,
        `${GHERKIN}const name = '@example/' + 'core'\nconst core = await import(name)\n`,
        '.integration.test.ts',
      ),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureRequiresAWorkspacePackage',
      ...suffix(JOURNEY, `${GHERKIN}const core = require('@example/core')\n`, '.integration.test.ts'),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureCreatesARequireForAWorkspacePackage',
      ...suffix(
        JOURNEY,
        `${GHERKIN}import { createRequire } from 'node:module'\nconst core = createRequire(import.meta.url)('@example/core')\n`,
        '.integration.test.ts',
      ),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureReExportsAWorkspacePackage',
      ...suffix(JOURNEY, `${GHERKIN}export * from '@example/core'\n`, '.integration.test.ts'),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AnE2eFeatureImportsAPackageThatIsNotInstalled',
      ...suffix(JOURNEY, `${GHERKIN}import { total } from '@example/aliased'\n`, '.integration.test.ts'),
    },
    {
      name: 'Should_AskForTheIntegrationName_When_AFixtureAnE2eFeatureImportsReachesAWorkspacePackage',
      ...suffix(JOURNEY, `${GHERKIN}import { total } from './__fixtures__/leaky.ts'\n`, '.integration.test.ts'),
    },
  ],
})
