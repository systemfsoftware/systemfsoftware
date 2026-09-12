import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  entry: {
    main: './src/main.ts',
  },
  format: 'esm',
  dts: false,
  outExtensions: () => ({ js: '.mjs' }),
  platform: 'node',
  exports: {
    packageJson: true,
    inlinedDependencies: false,
    bin: { conventions: './src/main.ts' },
  },
  deps: { onlyImport: [/^node:/], onlyBundle: false },
})
