import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
    Checker: './src/Checker.ts',
    Evaluator: './src/Evaluator.ts',
    ExitClass: './src/ExitClass.ts',
    Ignorer: './src/Ignorer.ts',
    Mutant: './src/Mutant.ts',
    Options: './src/Options.ts',
    Parser: './src/Parser.ts',
    Plugin: './src/Plugin.ts',
    'Plugin.schema': './src/Plugin.schema.ts',
    Report: './src/Report.ts',
    Reporter: './src/Reporter.ts',
    TestRunner: './src/TestRunner.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  clean: true,
  define: { 'import.meta.vitest': 'undefined' },
})
