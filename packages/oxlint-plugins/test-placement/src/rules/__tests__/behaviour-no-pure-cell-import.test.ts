import {
  PURE_CELL_IMPORT_ACTUAL,
  PURE_CELL_IMPORT_EXPECTED,
  PURE_CELL_IMPORT_FIX,
  PURE_CELL_IMPORT_NAME,
} from '../behaviour-no-pure-cell-import.config.js'
import { behaviourNoPureCellImport } from '../behaviour-no-pure-cell-import.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const FEATURE_IMPORTS = `
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

const Feature = makeFeature({ it, layer })
`

ruleTester.run('behaviour-no-pure-cell-import', behaviourNoPureCellImport, {
  valid: [
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAShellExecutor',
      code: `${FEATURE_IMPORTS}
import { hookDispatcher } from '../src/hook-dispatcher.executor.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/hook.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAHanlder',
      code: `${FEATURE_IMPORTS}
import { renderPrompt } from '../src/prompt-render.handler.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/prompt.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAnAdapter',
      code: `${FEATURE_IMPORTS}
import { fsLayer } from '../src/filesystem.adapter.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/fs.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_ItImportsAStore',
      code: `${FEATURE_IMPORTS}
import { openKv } from '../src/config.store.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/config.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_PureCellImportLooksLikeShellName',
      code: `${FEATURE_IMPORTS}
import { main } from '../src/main.ts'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/entry.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_CellTokenInNonFinalPathSegment',
      code: `${FEATURE_IMPORTS}
import { normalize } from '../src/kernel/util.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/tool.integration.test.ts',
    },
    {
      name: 'Should_Allow_IntegrationTest_When_CellTokenInMiddlePathSegment',
      code: `${FEATURE_IMPORTS}
import { helper } from '../src/executor/util.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/util.integration.test.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_KernelImport_When_CompositionReachesPureCellDirectly',
      code: `${FEATURE_IMPORTS}
import { normalizeToolName } from '../src/tool-name.kernel.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/tool.integration.test.ts',
      errors: [{
        messageId: 'pureCellImport',
        data: {
          name: PURE_CELL_IMPORT_NAME,
          expected: PURE_CELL_IMPORT_EXPECTED,
          actual: PURE_CELL_IMPORT_ACTUAL,
          fix: PURE_CELL_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_WorkflowImport_When_CompositionReachesPureCellDirectly',
      code: `${FEATURE_IMPORTS}
import { decide } from '../src/decide.workflow.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/decide.integration.test.ts',
      errors: [{
        messageId: 'pureCellImport',
        data: {
          name: PURE_CELL_IMPORT_NAME,
          expected: PURE_CELL_IMPORT_EXPECTED,
          actual: PURE_CELL_IMPORT_ACTUAL,
          fix: PURE_CELL_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_SchemaImport_When_CompositionReachesPureCellDirectly',
      code: `${FEATURE_IMPORTS}
import { Money } from '../src/money.schema.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/money.integration.test.ts',
      errors: [{
        messageId: 'pureCellImport',
        data: {
          name: PURE_CELL_IMPORT_NAME,
          expected: PURE_CELL_IMPORT_EXPECTED,
          actual: PURE_CELL_IMPORT_ACTUAL,
          fix: PURE_CELL_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_AclImport_When_CompositionReachesPureCellDirectly',
      code: `${FEATURE_IMPORTS}
import { decode } from '../src/db-row.acl.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/db.integration.test.ts',
      errors: [{
        messageId: 'pureCellImport',
        data: {
          name: PURE_CELL_IMPORT_NAME,
          expected: PURE_CELL_IMPORT_EXPECTED,
          actual: PURE_CELL_IMPORT_ACTUAL,
          fix: PURE_CELL_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_PureCellImport_When_ExtensionIsOmitted',
      code: `${FEATURE_IMPORTS}
import { normalizeToolName } from '../src/tool-name.kernel'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/tool.integration.test.ts',
      errors: [{
        messageId: 'pureCellImport',
        data: {
          name: PURE_CELL_IMPORT_NAME,
          expected: PURE_CELL_IMPORT_EXPECTED,
          actual: PURE_CELL_IMPORT_ACTUAL,
          fix: PURE_CELL_IMPORT_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_PureCellImport_When_DeepRelativePathEndsInCell',
      code: `${FEATURE_IMPORTS}
import { normalizeToolName } from './sub/inner/tool-name.kernel.js'

Feature('x', () => {})
`,
      filename: '/repo/pkg/__tests__/tool.integration.test.ts',
      errors: [{
        messageId: 'pureCellImport',
        data: {
          name: PURE_CELL_IMPORT_NAME,
          expected: PURE_CELL_IMPORT_EXPECTED,
          actual: PURE_CELL_IMPORT_ACTUAL,
          fix: PURE_CELL_IMPORT_FIX,
        },
      }],
    },
  ],
})
