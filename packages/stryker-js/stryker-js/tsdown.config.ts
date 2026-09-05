import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    Mutant: './src/Mutant.ts',
    Plugin: './src/Plugin.ts',
    Checker: './src/Checker.ts',
    TestRunner: './src/TestRunner.ts',
    Reporter: './src/Reporter.ts',
    Ignorer: './src/Ignorer.ts',
    Schema: './src/Schema.ts',
    Run: './src/Run.ts',
    Evaluator: './src/Evaluator.ts',
    ExitClass: './src/ExitClass.ts',
    Module: './src/Module.ts',
    'provided-options': './src/provided-options.ts',
    'output-file': './src/output-file.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  clean: true,
  define: { 'import.meta.vitest': 'undefined' },
})
