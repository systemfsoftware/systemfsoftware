import plugin from '@systemfsoftware/oxlint-plugin-test-discipline'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

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

const root = mkdtempSync(join(tmpdir(), 'e2e-tier-placement-'))

const write = (path: string, text: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

const link = (path: string, target: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  symlinkSync(join(root, target), join(root, path))
}

write('packages/core/package.json', JSON.stringify({ name: '@acme/core', exports: { '.': './src/index.ts' } }))
write('packages/core/src/index.ts', 'export const total = 1\n')
write('packages/core/tests/__fixtures__/reaching.ts', "export * from '../../src/index.ts'\n")
write('packages/core/tests/__fixtures__/outside-only.ts', "export { chromium } from 'browser-driver'\n")
write('packages/suite/package.json', JSON.stringify({ name: '@acme/suite', private: true }))
write('apps/shop-e2e/package.json', JSON.stringify({ name: '@acme/shop-e2e', private: true }))
write('apps/shop-e2e/tests/buying.e2e.ts', '')
write('apps/shop-e2e/tests/__fixtures__/stack.ts', "export { chromium } from 'browser-driver'\n")
write('apps/shop-e2e/tests/__fixtures__/leaky.ts', "export { total } from '@acme/core'\n")
write('node_modules/.pnpm/browser-driver@1.0.0/node_modules/browser-driver/package.json', '{"name":"browser-driver"}')
link('node_modules/browser-driver', 'node_modules/.pnpm/browser-driver@1.0.0/node_modules/browser-driver')
link('node_modules/@acme/core', 'packages/core')

const at = (path: string): string => join(root, path)

const GHERKIN = `import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'\n`
const DRIVER = `import { chromium } from 'browser-driver'\n`
const JOURNEY = at('apps/shop-e2e/tests/buying.e2e.ts')

const error = (messageId: string) => ({ messageId })

ruleTester.run('e2e-tier-placement', plugin.rules['e2e-tier-placement'], {
  valid: [
    {
      name: 'Should_Pass_When_AnE2eFeatureDrivesTheSystemThroughInstalledPackagesAndLocalFixtures',
      code: `${GHERKIN}${DRIVER}import { stack } from './__fixtures__/stack.ts'\n`,
      filename: JOURNEY,
    },
    {
      name: 'Should_Pass_When_AFixtureInTheE2ePackageImportsOnlyInstalledPackages',
      code: DRIVER,
      filename: at('apps/shop-e2e/tests/__fixtures__/stack.ts'),
    },
    {
      name: 'Should_Pass_When_AnIntegrationFeatureImportsItsOwnSource',
      code: `${GHERKIN}import { total } from '../src/index.ts'\n`,
      filename: at('packages/core/tests/total.integration.test.ts'),
    },
    {
      name: 'Should_Pass_When_AnIntegrationFeatureImportsItsOwnPackageByName',
      code: `${GHERKIN}import { total } from '@acme/core'\n`,
      filename: at('packages/core/tests/total.integration.test.ts'),
    },
    {
      name: 'Should_Pass_When_AnIntegrationFeatureReachesItsSourceThroughAFixture',
      code: `${GHERKIN}import { total } from './__fixtures__/reaching.ts'\n`,
      filename: at('packages/core/tests/total.integration.test.ts'),
    },
    {
      name: 'Should_Pass_When_ATestOnlyPackageHoldsAnIntegrationFeatureOfAWorkspacePackage',
      code: `${GHERKIN}import { total } from '@acme/core'\n`,
      filename: at('packages/suite/tests/total.integration.test.ts'),
    },
    {
      name: 'Should_Pass_When_AnIntegrationFeatureReachesItsPackageOnlyThroughATypeImport',
      code: `${GHERKIN}import type { total } from '@acme/core'\n`,
      filename: at('packages/core/tests/total.integration.test.ts'),
    },
    {
      name: 'Should_Pass_When_TheFileHasNoPackageToJudge',
      code: GHERKIN,
      filename: '/nowhere/pkg/tests/x.integration.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_RefuseAnE2eFile_When_ItIsOutsideTests',
      code: GHERKIN,
      filename: at('apps/shop-e2e/stack/buying.e2e.ts'),
      errors: [error('e2eOutsideTests')],
    },
    {
      name: 'Should_RefuseAnE2eFile_When_ItIsAFixture',
      code: GHERKIN,
      filename: at('apps/shop-e2e/tests/__fixtures__/buying.e2e.ts'),
      errors: [error('e2eOutsideTests')],
    },
    {
      name: 'Should_RefuseAnE2eFile_When_ItsPackageShipsCode',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('packages/core/tests/total.e2e.ts'),
      errors: [error('e2eOutsideE2ePackage')],
    },
    {
      name: 'Should_RefuseAnE2eFile_When_ItIsNotAFeature',
      code: DRIVER,
      filename: JOURNEY,
      errors: [error('e2eNotAFeature')],
    },
    {
      name: 'Should_RefuseAnyOtherTest_When_ItIsInTheE2ePackage',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('apps/shop-e2e/tests/buying.integration.test.ts'),
      errors: [error('otherTestInE2ePackage')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItImportsAWorkspacePackage',
      code: `${GHERKIN}import { total } from '@acme/core'\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItTypeImportsAWorkspacePackage',
      code: `${GHERKIN}import type { total } from '@acme/core'\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItImportsAnotherPackagesSourceByPath',
      code: `${GHERKIN}import { total } from '../../../packages/core/src/index.ts'\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItUsesASubpathImport',
      code: `${GHERKIN}import { total } from '#core'\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItDynamicallyImportsAWorkspacePackage',
      code: `${GHERKIN}const core = await import('@acme/core')\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItDynamicallyImportsAComputedTarget',
      code: `${GHERKIN}const name = '@acme/' + 'core'\nconst core = await import(name)\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItRequiresAWorkspacePackage',
      code: `${GHERKIN}const core = require('@acme/core')\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_ItReExportsAWorkspacePackage',
      code: `${GHERKIN}export * from '@acme/core'\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnE2eFeature_When_AFixtureItImportsReachesAWorkspacePackage',
      code: `${GHERKIN}import { total } from './__fixtures__/leaky.ts'\n`,
      filename: JOURNEY,
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAFixtureInTheE2ePackage_When_ItImportsAWorkspacePackage',
      code: `import { total } from '@acme/core'\n`,
      filename: at('apps/shop-e2e/tests/__fixtures__/leaky.ts'),
      errors: [error('e2eReachesSource')],
    },
    {
      name: 'Should_RefuseAnIntegrationFeature_When_ItImportsOnlyInstalledPackages',
      code: `${GHERKIN}${DRIVER}`,
      filename: at('packages/core/tests/buying.integration.test.ts'),
      errors: [error('featureReachesNothing')],
    },
    {
      name: 'Should_RefuseAnIntegrationFeature_When_ItsFixturesReachOnlyInstalledPackages',
      code: `${GHERKIN}import { chromium } from './__fixtures__/outside-only.ts'\n`,
      filename: at('packages/core/tests/buying.integration.test.ts'),
      errors: [error('featureReachesNothing')],
    },
    {
      name: 'Should_RefuseAnIntegrationFeature_When_ATestOnlyPackageImportsNothingOfOurs',
      code: GHERKIN,
      filename: at('packages/suite/tests/buying.integration.test.ts'),
      errors: [error('featureReachesNothing')],
    },
  ],
})
