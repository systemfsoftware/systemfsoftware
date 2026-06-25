import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noNewWorkerWithWasmImport } from '../no-new-worker-with-wasm-import.js'

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

const SYNTHETIC_WASM_PKG = '@test/example-wasm'
const SYNTHETIC_WASM_PKG_NON_SCOPED = 'example-wasm'
const SYNTHETIC_WASM_SUBPATH = 'example-wasm/binding'

const newWorkerError = {
  messageId: 'forbiddenNewWorkerWithWasm' as const,
  data: {
    expected: 'Bun.spawn subprocess pool',
    actual: 'new Worker(filePath)',
    fix:
      'Run each worker in its own OS process (not in a thread of the parent) so each one has its own WASM heap and concurrent init cannot race. A subprocess-per-worker pool with a per-child crash handler (re-dispatch the in-flight work and spawn a replacement) is the standard shape.',
  },
}

ruleTester.run('no-new-worker-with-wasm-import', noNewWorkerWithWasmImport, {
  valid: [
    // No WASM import — new Worker is allowed
    {
      name: 'allows new Worker without WASM import',
      code: `
        const w = new Worker('./worker.js')
      `,
    },
    // Non-WASM import, new Worker in use — fine
    {
      name: 'allows new Worker when no WASM dep is imported',
      code: `
        import { foo } from 'some-lib'
        const w = new Worker('./worker.js')
      `,
    },
    // WASM-imported file but no new Worker — fine
    {
      name: 'allows WASM import with no new Worker',
      code: `
        import { fn } from '${SYNTHETIC_WASM_PKG}'
        const out = fn('payload')
      `,
    },
    // WASM-imported file using a subprocess-style alternative — correct path
    {
      name: 'allows subprocess-style pool with WASM import',
      code: `
        import { fn } from '${SYNTHETIC_WASM_PKG}'
        const child = startSubprocess(['run', './worker.ts'], { onCrash: handler })
      `,
    },
    // Non-WASM import that happens to contain the substring "wasm" — not matched
    {
      name: 'allows new Worker when import is not a WASM package (no -wasm suffix)',
      code: `
        import { config } from 'wasm-config-helper'
        const w = new Worker('./worker.js')
      `,
    },
    // Other NewExpression callees are fine
    {
      name: 'allows other NewExpression constructors with WASM import',
      code: `
        import { fn } from '${SYNTHETIC_WASM_PKG}'
        const m = new Map()
        const s = new Set()
        const e = new Error('oops')
      `,
    },
    // Non-scoped synthetic WASM dep with no new Worker
    {
      name: 'allows non-scoped WASM dep with no new Worker',
      code: `
        import { init } from '${SYNTHETIC_WASM_PKG_NON_SCOPED}'
        init()
      `,
    },
  ],
  invalid: [
    // Scoped synthetic WASM import + new Worker — fires
    {
      name: 'detects new Worker with scoped synthetic WASM import',
      code: `
        import { fn } from '${SYNTHETIC_WASM_PKG}'
        const w = new Worker('./worker.js')
      `,
      errors: [newWorkerError],
    },
    // Non-scoped synthetic WASM import + new Worker
    {
      name: 'detects new Worker with non-scoped synthetic WASM import',
      code: `
        import { init } from '${SYNTHETIC_WASM_PKG_NON_SCOPED}'
        const w = new Worker('./worker.ts')
      `,
      errors: [newWorkerError],
    },
    // Sub-path synthetic WASM import
    {
      name: 'detects new Worker with synthetic WASM sub-path import',
      code: `
        import { fn } from '${SYNTHETIC_WASM_SUBPATH}'
        const w = new Worker('./worker.js')
      `,
      errors: [newWorkerError],
    },
    // Default-imported synthetic WASM
    {
      name: 'detects new Worker with default-imported synthetic WASM',
      code: `
        import wasm from '${SYNTHETIC_WASM_PKG}'
        const w = new Worker('./worker.js')
      `,
      errors: [newWorkerError],
    },
    // Multiple new Worker usages with WASM dep
    {
      name: 'detects multiple new Worker usages with WASM import',
      code: `
        import { fn } from '${SYNTHETIC_WASM_PKG}'
        const w1 = new Worker('./a.js')
        const w2 = new Worker('./b.js')
      `,
      errors: [newWorkerError, newWorkerError],
    },
    // Custom expected + fix via options
    {
      name: 'honors custom expected and fix options',
      code: `
        import { fn } from '${SYNTHETIC_WASM_PKG}'
        const w = new Worker('./worker.js')
      `,
      options: [
        {
          expected: 'custom expected text',
          fix: 'custom fix text',
        },
      ],
      errors: [
        {
          messageId: 'forbiddenNewWorkerWithWasm',
          data: {
            expected: 'custom expected text',
            actual: 'new Worker(filePath)',
            fix: 'custom fix text',
          },
        },
      ],
    },
    // Custom wasmImportPatterns via options
    {
      name: 'honors custom wasmImportPatterns option',
      code: `
        import { something } from 'my-custom-package'
        const w = new Worker('./worker.js')
      `,
      options: [
        { wasmImportPatterns: ['my-custom-package'] },
      ],
      errors: [newWorkerError],
    },
  ],
})
