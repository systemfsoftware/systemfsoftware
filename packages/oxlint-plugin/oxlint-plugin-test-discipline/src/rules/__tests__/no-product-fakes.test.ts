import { noProductFakes } from '../no-product-fakes.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const TEST = '/repo/pkg/tests/a.test.ts'
const STORY = '/repo/pkg/ui/shell/a.stories.tsx'
const CONFIG = '/repo/pkg/vitest.config.ts'

ruleTester.run('no-product-fakes', noProductFakes, {
  valid: [
    {
      name: 'Should_StaySilent_When_ProductIsNotMocked',
      code: "import { vi } from 'vitest'\nvi.mocked(fn)",
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_TestWaitsWithViWaitFor',
      code: "import { vi } from 'vitest'\nvi.waitFor(() => x)",
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_TestingLibraryIsImported',
      code: "import { render } from '@testing-library/react'",
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_JestDomIsImported',
      code: "import '@testing-library/jest-dom'",
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_ConfigUsesRealBrowserEnvironment',
      code: "export default { test: { environment: 'browser' } }",
      filename: CONFIG,
    },
    {
      name: 'Should_StaySilent_When_ConfigUsesNodeEnvironment',
      code: "export default { test: { environment: 'node' } }",
      filename: CONFIG,
    },
    {
      name: 'Should_StaySilent_When_EnvironmentSitsOutsideAConfigFile',
      code: "export const x = { environment: 'jsdom' }",
      filename: '/repo/pkg/src/a.ts',
    },
    {
      name: 'Should_StaySilent_When_FakeApisOptionOmitsTheCalledDouble',
      code: "import { vi } from 'vitest'\nvi.mock('./handler')",
      filename: TEST,
      options: [{ fakeApis: [{ object: 'sinon', members: ['stub'] }] }],
    },
    {
      name: 'Should_StaySilent_When_ComputedMemberIsNotAString',
      code: "import { vi } from 'vitest'\nvi[method]('./handler')",
      filename: TEST,
    },
    {
      name: 'Should_StaySilent_When_BannedEnvironmentsOptionOmitsTheEnvironment',
      code: "export default { test: { environment: 'jsdom' } }",
      filename: CONFIG,
      options: [{ bannedEnvironments: ['node'] }],
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ViMockReplacesTheModule',
      code: "import { vi } from 'vitest'\nvi.mock('./handler')",
      filename: TEST,
      errors: [{ messageId: 'fakeApi', data: { name: 'vi.mock' } }],
    },
    {
      name: 'Should_Report_When_ViDoMockReplacesTheModule',
      code: "import { vi } from 'vitest'\nvi.doMock('./handler')",
      filename: TEST,
      errors: [{ messageId: 'fakeApi', data: { name: 'vi.doMock' } }],
    },
    {
      name: 'Should_Report_When_ViFnBuildsATestDouble',
      code: "import { vi } from 'vitest'\nconst f = vi.fn()",
      filename: TEST,
      errors: [{ messageId: 'fakeApi', data: { name: 'vi.fn' } }],
    },
    {
      name: 'Should_Report_When_ViSpyOnReplacesAMethod',
      code: "import { vi } from 'vitest'\nvi.spyOn(clock, 'now')",
      filename: TEST,
      errors: [{ messageId: 'fakeApi', data: { name: 'vi.spyOn' } }],
    },
    {
      name: 'Should_Report_When_ViStubGlobalReplacesAGlobal',
      code: "import { vi } from 'vitest'\nvi.stubGlobal('fetch', f)",
      filename: TEST,
      errors: [{ messageId: 'fakeApi', data: { name: 'vi.stubGlobal' } }],
    },
    {
      name: 'Should_Report_When_StorybookMockReplacesTheModule',
      code: "sb.mock('./handler')",
      filename: STORY,
      errors: [{ messageId: 'fakeApi', data: { name: 'sb.mock' } }],
    },
    {
      name: 'Should_Report_When_MockServerModuleIsImported',
      code: "import 'msw'",
      filename: TEST,
      errors: [{ messageId: 'bannedImport', data: { module: 'msw' } }],
    },
    {
      name: 'Should_Report_When_MockServerSubpathIsImported',
      code: "import { setupServer } from 'msw/node'",
      filename: TEST,
      errors: [{ messageId: 'bannedImport', data: { module: 'msw/node' } }],
    },
    {
      name: 'Should_Report_When_DomEmulatorModuleIsImported',
      code: "import 'jsdom'",
      filename: TEST,
      errors: [{ messageId: 'bannedImport', data: { module: 'jsdom' } }],
    },
    {
      name: 'Should_Report_When_HappyDomModuleIsImported',
      code: "import 'happy-dom'",
      filename: TEST,
      errors: [{ messageId: 'bannedImport', data: { module: 'happy-dom' } }],
    },
    {
      name: 'Should_Report_When_ScopedHappyDomSubpathIsImported',
      code: "import { GlobalRegistrator } from '@happy-dom/global-registrator'",
      filename: TEST,
      errors: [{ messageId: 'bannedImport', data: { module: '@happy-dom/global-registrator' } }],
    },
    {
      name: 'Should_Report_When_ConfigUsesJsdomEnvironment',
      code: "export default { test: { environment: 'jsdom' } }",
      filename: CONFIG,
      errors: [{ messageId: 'bannedEnvironment', data: { environment: 'jsdom' } }],
    },
    {
      name: 'Should_Report_When_ConfigUsesHappyDomEnvironment',
      code: "export default { test: { environment: 'happy-dom' } }",
      filename: CONFIG,
      errors: [{ messageId: 'bannedEnvironment', data: { environment: 'happy-dom' } }],
    },
    {
      name: 'Should_Report_When_ComputedMemberNamesADouble',
      code: "import { vi } from 'vitest'\nvi['mock']('./handler')",
      filename: TEST,
      errors: [{ messageId: 'fakeApi', data: { name: 'vi.mock' } }],
    },
    {
      name: 'Should_Report_When_FakeApisOptionNamesTheCalledDouble',
      code: 'sinon.stub()',
      filename: TEST,
      options: [{ fakeApis: [{ object: 'sinon', members: ['stub'] }] }],
      errors: [{ messageId: 'fakeApi', data: { name: 'sinon.stub' } }],
    },
    {
      name: 'Should_Report_When_BannedModulesOptionNamesTheImport',
      code: "import 'testdouble'",
      filename: TEST,
      options: [{ bannedModules: ['testdouble'] }],
      errors: [{ messageId: 'bannedImport', data: { module: 'testdouble' } }],
    },
  ],
})
