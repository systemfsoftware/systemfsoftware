import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './src/index.ts',
  },
  format: 'esm',
  dts: true,
  exports: { devExports: '@systemfsoftware/source' },
  // `jsr:` specs publish as `npm:@jsr/std__jsonc@…`, which exists only on npm.jsr.io, so a
  // default-registry consumer cannot install it. Inlining the parser (a leaf, no runtime
  // imports) keeps the published artifact free of any `@jsr` dep. Dropping this line
  // reintroduces an uninstallable release — verified by packing and installing the tarball.
  noExternal: ['@std/jsonc'],
  clean: false,
})
