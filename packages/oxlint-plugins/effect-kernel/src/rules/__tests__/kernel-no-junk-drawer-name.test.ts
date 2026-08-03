import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { kernelNoJunkDrawerName } from '../kernel-no-junk-drawer-name.js'

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

const junkDrawerData = (segment: string) => ({
  name: segment,
  expected: 'a descriptive name for the vocabulary-free behavior it provides (e.g. fold.kernel.ts)',
  actual: `a path segment '${segment}' from the banned junk-drawer list`,
  fix: 'rename the module to describe the generic behavior it provides and move it out of the junk-drawer folder',
})

ruleTester.run('kernel-no-junk-drawer-name', kernelNoJunkDrawerName, {
  valid: [
    {
      name: 'Should_Pass_When_KernelFileHasDescriptiveBaseName',
      code: '',
      filename: '/repo/pkg/src/fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelFileHasMultiWordBaseName',
      code: '',
      filename: '/repo/pkg/src/retry-jitter.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelFileUnderDomainFolder',
      code: '',
      filename: '/repo/pkg/src/money/fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelFileUnderKernelFolder',
      code: '',
      filename: '/repo/pkg/src/kernel/fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelFileContainsJunkWordInsideName',
      code: '',
      filename: '/repo/pkg/src/money-helper.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelFileUnderCompoundFolderName',
      code: '',
      filename: '/repo/pkg/src/common-stuff/fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_NonKernelFileInJunkDrawerFolder',
      code: '',
      filename: '/repo/pkg/src/utils/fold.ts',
    },
    {
      name: 'Should_Pass_When_NonKernelFileNamedUtils',
      code: '',
      filename: '/repo/pkg/src/utils.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowFileInCoreFolder',
      code: '',
      filename: '/repo/pkg/src/core/decide.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_KernelFileNamedUtils',
      code: '',
      filename: '/repo/pkg/src/utils.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('utils') }],
    },
    {
      name: 'Should_Report_When_KernelFileNamedUtil',
      code: '',
      filename: '/repo/pkg/src/util.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('util') }],
    },
    {
      name: 'Should_Report_When_KernelFileNamedHelper',
      code: '',
      filename: '/repo/pkg/src/helper.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('helper') }],
    },
    {
      name: 'Should_Report_When_KernelFileNamedCommon',
      code: '',
      filename: '/repo/pkg/src/common.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('common') }],
    },
    {
      name: 'Should_Report_When_KernelFileNamedShared',
      code: '',
      filename: '/repo/pkg/src/shared.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('shared') }],
    },
    {
      name: 'Should_Report_When_KernelFileNamedLib',
      code: '',
      filename: '/repo/pkg/src/lib.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('lib') }],
    },
    {
      name: 'Should_Report_When_KernelFileUnderUtilsFolder',
      code: '',
      filename: '/repo/pkg/src/utils/fold.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('utils') }],
    },
    {
      name: 'Should_Report_When_KernelFileUnderCoreFolder',
      code: '',
      filename: '/repo/pkg/src/core/fold.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('core') }],
    },
    {
      name: 'Should_Report_When_KernelFileUnderShellFolder',
      code: '',
      filename: '/repo/pkg/src/shell/fold.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('shell') }],
    },
    {
      name: 'Should_Report_FirstSegment_When_MultipleSegmentsBanned',
      code: '',
      filename: '/repo/pkg/src/core/lib.kernel.ts',
      errors: [{ messageId: 'junkDrawerSegment', data: junkDrawerData('core') }],
    },
  ],
})
