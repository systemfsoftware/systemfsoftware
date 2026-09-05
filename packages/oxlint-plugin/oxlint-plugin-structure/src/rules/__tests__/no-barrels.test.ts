import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noBarrels } from '../no-barrels.js'

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

const barrelFileErrors = (_filename: string, source: string) => [
  { messageId: 'reExportAll' as const, data: { source } },
]

const namedReExportErrors = (_filename: string, source: string, specifiers: string) => [
  { messageId: 'reExportNamed' as const, data: { source, specifiers } },
]

const barrelImportError = (path: string) => [
  { messageId: 'barrelImport' as const, data: { path } },
]

ruleTester.run('no-barrels', noBarrels, {
  valid: [
    // Non-barrel files — no detection
    {
      name: 'allows regular file with direct exports',
      code: `export const foo = 1`,
    },
    {
      name: 'allows index.ts with only direct exports',
      code: `export const foo = 1`,
      filename: 'src/utils/index.ts',
    },
    {
      name: 'allows mod.ts with only direct exports',
      code: `export const foo = 1`,
      filename: 'src/utils/mod.ts',
    },
    // Non-barrel filenames with re-exports — not flagged
    {
      name: 'allows re-exports in non-barrel filename',
      code: `export * from './module'`,
      filename: 'src/utils/helper.ts',
    },
    {
      name: 'allows named re-exports in non-barrel filename',
      code: `export { foo } from './module'`,
      filename: 'src/utils/helper.ts',
    },
    {
      name: 'allows empty re-exports in non-barrel filename',
      code: `export {} from './module'`,
      filename: 'src/utils/helper.ts',
    },
    // Near-miss barrel filenames
    {
      name: 'allows index-prefixed filename',
      code: `export const foo = 1`,
      filename: 'src/utils/index-helper.ts',
    },
    // Non-barrel imports
    {
      name: 'allows import from non-barrel path',
      code: `import { foo } from './utils'`,
    },
    {
      name: 'allows import from external package',
      code: `import { Effect } from 'effect'`,
    },
    {
      name: 'allows import from relative parent',
      code: `import { foo } from '../'`,
    },
    {
      name: 'allows import from index-like filename',
      code: `import { foo } from './myindex'`,
    },
    {
      name: 'allows import from absolute non-barrel path',
      code: `import { foo } from '/usr/lib/utils'`,
    },
    {
      name: 'allows import from package with index in name',
      code: `import { foo } from 'some-index-package'`,
    },
    {
      name: 'allows import from external package with index path segment',
      code: `import { foo } from 'some-package/index'`,
    },
    // Root barrel exclusion (default: excludeRoot=true)
    {
      name: 'excludes root barrel when src is first directory',
      code: `export * from './module'`,
      filename: 'src/index.ts',
    },
    {
      name: 'excludes root src/index.ts by default',
      code: `export * from './module'`,
      filename: '/project/src/index.ts',
    },
    {
      name: 'excludes root src/mod.ts by default',
      code: `export * from './module'`,
      filename: '/project/src/mod.ts',
    },
    {
      name: 'excludes root src/index.tsx by default',
      code: `export * from './module'`,
      filename: '/project/src/index.tsx',
    },
    {
      name: 'excludes root src/mod.tsx by default',
      code: `export * from './module'`,
      filename: '/project/src/mod.tsx',
    },
    // Severity off
    {
      name: 'disables all detection when severity is off',
      code: `
        export * from './module'
        import { foo } from './utils/index'
      `,
      options: [{ severity: 'off' }],
    },
    // Dynamic imports
    {
      name: 'allows dynamic import with variable expression',
      code: `
        const moduleName = './utils/index'
        import(moduleName)
      `,
    },
    {
      name: 'allows dynamic import from non-barrel path',
      code: `import('./utils/helper')`,
    },
  ],
  invalid: [
    // Barrel file detection — export * by extension
    {
      name: 'detects barrel export-all in index.ts',
      code: `export * from './module'`,
      filename: 'src/utils/index.ts',
      errors: barrelFileErrors('index.ts', './module'),
    },
    {
      name: 'detects barrel export-all in index.tsx',
      code: `export * from './module'`,
      filename: 'src/components/index.tsx',
      errors: barrelFileErrors('index.tsx', './module'),
    },
    {
      name: 'detects barrel export-all in mod.ts',
      code: `export * from './module'`,
      filename: 'src/utils/mod.ts',
      errors: barrelFileErrors('mod.ts', './module'),
    },
    {
      name: 'detects barrel export-all in mod.tsx',
      code: `export * from './module'`,
      filename: 'src/utils/mod.tsx',
      errors: barrelFileErrors('mod.tsx', './module'),
    },
    // Named re-export variants
    {
      name: 'detects named re-export in barrel file',
      code: `export { foo } from './module'`,
      filename: 'src/utils/index.ts',
      errors: namedReExportErrors('index.ts', './module', 'foo'),
    },
    {
      name: 'detects empty re-export in barrel file',
      code: `export {} from './module'`,
      filename: 'src/utils/index.ts',
      errors: namedReExportErrors('index.ts', './module', ''),
    },
    {
      name: 'detects multiple specifiers in re-export',
      code: `export { foo, bar, baz } from './module'`,
      filename: 'src/utils/index.ts',
      errors: namedReExportErrors('index.ts', './module', 'foo, bar, baz'),
    },
    {
      name: 'detects aliased re-export',
      code: `export { foo as bar } from './module'`,
      filename: 'src/utils/index.ts',
      errors: namedReExportErrors('index.ts', './module', 'foo as bar'),
    },
    {
      name: 'detects string literal export specifier',
      code: `export { foo as "bar-baz" } from './module'`,
      filename: 'src/utils/index.ts',
      errors: namedReExportErrors('index.ts', './module', 'foo as bar-baz'),
    },
    // Multiple re-exports in one file
    {
      name: 'reports each re-export separately in barrel file',
      code: `
        export * from './module1'
        export { foo } from './module2'
      `,
      filename: 'src/utils/index.ts',
      errors: [
        { messageId: 'reExportAll', data: { source: './module1' } },
        { messageId: 'reExportNamed', data: { source: './module2', specifiers: 'foo' } },
      ],
    },
    // Barrel import detection — by extension
    {
      name: 'detects import from /index path',
      code: `import { foo } from './utils/index'`,
      errors: barrelImportError('./utils/index'),
    },
    {
      name: 'detects import from /index.ts path',
      code: `import { foo } from './utils/index.ts'`,
      errors: barrelImportError('./utils/index.ts'),
    },
    {
      name: 'detects import from /index.tsx path',
      code: `import { foo } from './utils/index.tsx'`,
      errors: barrelImportError('./utils/index.tsx'),
    },
    {
      name: 'detects import from /index.js path',
      code: `import { foo } from './utils/index.js'`,
      errors: barrelImportError('./utils/index.js'),
    },
    {
      name: 'detects import from /index.jsx path',
      code: `import { foo } from './utils/index.jsx'`,
      errors: barrelImportError('./utils/index.jsx'),
    },
    {
      name: 'detects import from /mod path',
      code: `import { foo } from './utils/mod'`,
      errors: barrelImportError('./utils/mod'),
    },
    {
      name: 'detects import from /mod.ts path',
      code: `import { foo } from './utils/mod.ts'`,
      errors: barrelImportError('./utils/mod.ts'),
    },
    {
      name: 'detects import from /mod.tsx path',
      code: `import { foo } from './utils/mod.tsx'`,
      errors: barrelImportError('./utils/mod.tsx'),
    },
    {
      name: 'detects import from /mod.js path',
      code: `import { foo } from './utils/mod.js'`,
      errors: barrelImportError('./utils/mod.js'),
    },
    {
      name: 'detects import from /mod.jsx path',
      code: `import { foo } from './utils/mod.jsx'`,
      errors: barrelImportError('./utils/mod.jsx'),
    },
    // Barrel import — different import styles
    {
      name: 'detects namespace import from barrel',
      code: `import * as utils from './utils/index'`,
      errors: barrelImportError('./utils/index'),
    },
    {
      name: 'detects default import from barrel',
      code: `import utils from './utils/index'`,
      errors: barrelImportError('./utils/index'),
    },
    {
      name: 'detects side-effect import from barrel',
      code: `import './utils/index'`,
      errors: barrelImportError('./utils/index'),
    },
    // Barrel import — short and deep paths
    {
      name: 'detects import from short barrel path',
      code: `import { foo } from './index.ts'`,
      errors: barrelImportError('./index.ts'),
    },
    {
      name: 'detects import from deep barrel path',
      code: `import { foo } from './deep/nested/path/index.ts'`,
      errors: barrelImportError('./deep/nested/path/index.ts'),
    },
    {
      name: 'detects import from deep mod barrel path',
      code: `import { foo } from './deep/nested/path/mod.ts'`,
      errors: barrelImportError('./deep/nested/path/mod.ts'),
    },
    // Barrel file at root slash (slashIndex === 0)
    {
      name: 'detects barrel export-all when slash at position zero',
      code: `export * from './module'`,
      filename: '/index.ts',
      errors: barrelFileErrors('index.ts', './module'),
    },
    // Root barrel NOT excluded when excludeRoot is false
    {
      name: 'flags root src/index.ts when excludeRoot is false',
      code: `export * from './module'`,
      filename: 'src/index.ts',
      options: [{ severity: 'warn', excludeRoot: false }],
      errors: barrelFileErrors('index.ts', './module'),
    },
    {
      name: 'flags root src/mod.ts when excludeRoot is false',
      code: `export * from './module'`,
      filename: 'src/mod.ts',
      options: [{ severity: 'warn', excludeRoot: false }],
      errors: barrelFileErrors('mod.ts', './module'),
    },
    {
      name: 'flags root src/index.tsx when excludeRoot is false',
      code: `export * from './module'`,
      filename: 'src/index.tsx',
      options: [{ severity: 'warn', excludeRoot: false }],
      errors: barrelFileErrors('index.tsx', './module'),
    },
    {
      name: 'flags root src/mod.tsx when excludeRoot is false',
      code: `export * from './module'`,
      filename: 'src/mod.tsx',
      options: [{ severity: 'warn', excludeRoot: false }],
      errors: barrelFileErrors('mod.tsx', './module'),
    },
    {
      name: 'flags deep root src/index.tsx when excludeRoot is false',
      code: `export * from './module'`,
      filename: 'project/src/index.tsx',
      options: [{ severity: 'warn', excludeRoot: false }],
      errors: barrelFileErrors('index.tsx', './module'),
    },
    {
      name: 'flags deep root src/mod.tsx when excludeRoot is false',
      code: `export * from './module'`,
      filename: 'project/src/mod.tsx',
      options: [{ severity: 'warn', excludeRoot: false }],
      errors: barrelFileErrors('mod.tsx', './module'),
    },
    // Severity error
    {
      name: 'reports with error severity option',
      code: `export * from './module'`,
      filename: 'src/utils/index.ts',
      options: [{ severity: 'error' }],
      errors: barrelFileErrors('index.ts', './module'),
    },
    // Absolute barrel import
    {
      name: 'detects absolute barrel import',
      code: `import { foo } from '/project/src/utils/index'`,
      errors: barrelImportError('/project/src/utils/index'),
    },
    // Dynamic import
    {
      name: 'detects dynamic import from barrel path',
      code: `import('./utils/index')`,
      errors: barrelImportError('./utils/index'),
    },
  ],
})
