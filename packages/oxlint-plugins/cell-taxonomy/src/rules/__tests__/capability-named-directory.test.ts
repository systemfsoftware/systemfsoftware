import { ACTUAL, EXPECTED, FIX } from '../capability-named-directory.config.js'
import { capabilityNamedDirectory } from '../capability-named-directory.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const banned = (name: string) => [{
  messageId: 'bannedDirectory',
  data: {
    name,
    expected: EXPECTED,
    actual: ACTUAL,
    fix: FIX,
  },
}]

ruleTester.run('capability-named-directory', capabilityNamedDirectory, {
  valid: [
    {
      name: 'Should_Allow_CapabilityNamedDirectories',
      code: '',
      filename: '/repo/packages/stryker-js/mutation-run/src/reporting/broadcast-reporter.ts',
    },
    {
      name: 'Should_Allow_DomainNounDirectory',
      code: '',
      filename: '/repo/packages/x/src/sandbox/sandbox.ts',
    },
    {
      name: 'Should_Allow_BannedSegment_When_ExemptPrefixCoversIt',
      code: '',
      filename: '/repo/packages/x/src/utils/string-utils.ts',
      options: [{ exempt: [{ prefix: 'packages/x/src', reason: 'test debt' }] }],
    },
    {
      name: 'Should_Allow_AnySegment_When_UnderNodeModules',
      code: '',
      filename: '/repo/node_modules/pkg/src/utils/x.ts',
    },
    {
      name: 'Should_Allow_AnySegment_When_UnderVendoredRepos',
      code: '',
      filename: '/repo/repos/vendor/src/utils/x.ts',
    },
    {
      name: 'Should_Allow_BannedSegment_When_UnderDunderTestsDir',
      code: '',
      filename: '/repo/packages/effect-daemon-spec/__tests__/helpers/test-utils.ts',
    },
    {
      name: 'Should_Allow_BannedSegment_When_UnderTestRoot',
      code: '',
      filename: '/repo/packages/x/test/unit/thing.spec.ts',
    },
    {
      name: 'Should_Allow_BannedWord_When_ItIsTheBasename',
      code: '',
      filename: '/repo/src/reporting/core.ts',
    },
    {
      name: 'Should_Allow_File_When_DirectlyUnderSrc',
      code: '',
      filename: '/repo/src/index.ts',
    },
    {
      name: 'Should_Allow_AnySegment_When_UnderDist',
      code: '',
      filename: '/repo/packages/x/dist/utils/x.js',
    },
    {
      name: 'Should_Allow_AnySegment_When_UnderStrykerTemp',
      code: '',
      filename: '/repo/packages/x/.stryker-tmp/utils/x.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_LayerSegment_When_CoreDirectory',
      code: '',
      filename: '/repo/packages/stryker-js/core/src/index.ts',
      errors: banned('core'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_UtilsDirectory',
      code: '',
      filename: '/repo/packages/x/src/utils/string-utils.ts',
      errors: banned('utils'),
    },
    {
      name: 'Should_Report_MechanismSegment_When_DiDirectory',
      code: '',
      filename: '/repo/packages/x/src/di/plugin-loader.ts',
      errors: banned('di'),
    },
    {
      name: 'Should_Report_MechanismSegment_When_FsDirectory',
      code: '',
      filename: '/repo/packages/x/src/fs/project.ts',
      errors: banned('fs'),
    },
    {
      name: 'Should_Report_Once_When_TwoBannedSegments',
      code: '',
      filename: '/repo/packages/x/src/utils/di/plugin-loader.ts',
      errors: banned('utils'),
    },
    {
      name: 'Should_Report_BannedSegment_When_ExemptPrefixDoesNotCoverIt',
      code: '',
      filename: '/repo/packages/other/src/utils/thing.ts',
      options: [{ exempt: [{ prefix: 'packages/x/src', reason: 'test debt' }] }],
      errors: banned('utils'),
    },
    {
      name: 'Should_Report_LayerSegment_When_ShellDirectory',
      code: '',
      filename: '/repo/packages/x/src/shell/thing.ts',
      errors: banned('shell'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_UtilDirectory',
      code: '',
      filename: '/repo/packages/x/src/util/thing.ts',
      errors: banned('util'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_ServiceDirectory',
      code: '',
      filename: '/repo/packages/x/src/service/thing.ts',
      errors: banned('service'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_ServicesDirectory',
      code: '',
      filename: '/repo/packages/x/src/services/thing.ts',
      errors: banned('services'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_ManagerDirectory',
      code: '',
      filename: '/repo/packages/x/src/manager/thing.ts',
      errors: banned('manager'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_ManagersDirectory',
      code: '',
      filename: '/repo/packages/x/src/managers/thing.ts',
      errors: banned('managers'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_HelperDirectory',
      code: '',
      filename: '/repo/packages/x/src/helper/thing.ts',
      errors: banned('helper'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_HelpersDirectory',
      code: '',
      filename: '/repo/packages/x/src/helpers/thing.ts',
      errors: banned('helpers'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_CommonDirectory',
      code: '',
      filename: '/repo/packages/x/src/common/thing.ts',
      errors: banned('common'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_SharedDirectory',
      code: '',
      filename: '/repo/packages/x/src/shared/thing.ts',
      errors: banned('shared'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_MiscDirectory',
      code: '',
      filename: '/repo/packages/x/src/misc/thing.ts',
      errors: banned('misc'),
    },
    {
      name: 'Should_Report_JunkDrawerSegment_When_LibDirectory',
      code: '',
      filename: '/repo/packages/x/src/lib/thing.ts',
      errors: banned('lib'),
    },
    {
      name: 'Should_Report_MechanismSegment_When_ImplDirectory',
      code: '',
      filename: '/repo/packages/x/src/impl/thing.ts',
      errors: banned('impl'),
    },
  ],
})
