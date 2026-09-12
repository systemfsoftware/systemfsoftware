import { defineConfig } from 'tsdown'

import wasiManifest from '@oxc-parser/binding-wasm32-wasi/package.json' with { type: 'json' }
import parserManifest from 'oxc-parser/package.json' with { type: 'json' }

if (parserManifest.version !== wasiManifest.version) {
  throw new Error(
    `oxc-parser@${parserManifest.version} is aliased to @oxc-parser/binding-wasm32-wasi@${wasiManifest.version}; the parser binds its own version's WebAssembly ABI, so the two must match exactly.`,
  )
}

const resolvePath = (specifier: string): string => new URL(import.meta.resolve(specifier)).pathname

const { readFileSync } = process.getBuiltinModule('node:fs')

const parserEntry = resolvePath('oxc-parser/src-js/wasm.js')
const wasiModule = resolvePath('@oxc-parser/binding-wasm32-wasi/parser.wasm32-wasi.wasm')
const htmlReporterClientBundle = resolvePath('mutation-testing-elements/dist/mutation-test-elements.js')

export default defineConfig({
  clean: true,
  entry: {
    main: './src/main.ts',
    'workers/checker-worker': './src/workers/Checker.worker.ts',
    'workers/child-process-test-runner-worker': './src/workers/child-process-test-runner-worker.ts',
    'reporters/html': '@systemfsoftware/stryker-js-html-reporter',
  },
  format: 'esm',
  dts: false,
  outExtensions: () => ({ js: '.mjs' }),
  tsconfig: './tsconfig.build.json',
  define: {
    'import.meta.vitest': 'undefined',
    __STRYKER_HTML_REPORTER_CLIENT_BUNDLE__: JSON.stringify(readFileSync(htmlReporterClientBundle, 'utf8')),
  },
  platform: 'node',
  shims: true,
  alias: { 'oxc-parser': parserEntry },
  copy: [{ from: wasiModule, rename: 'parser.wasm32-wasi.wasm' }],
  exports: {
    packageJson: true,
    exclude: [
      'main',
      'workers/checker-worker',
      'workers/child-process-test-runner-worker',
      'reporters/html',
    ],
    inlinedDependencies: false,
    bin: { stryker: './src/main.ts' },
  },
  deps: { alwaysBundle: [/./], onlyImport: [/^node:/], onlyBundle: false },
})
