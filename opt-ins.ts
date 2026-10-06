export default [
  {
    name: 'type-refusal-fixtures-declare-their-own-errors',
    owner: '@ryanleecode',
    reason:
      'Compile-refusal fixtures prove a shape is rejected by holding a deliberate type error under @ts-expect-error. Their scope is excluded from the debt scan in debt-ledger.config.ts; this opt-in records the owner and reason for that exclusion so it is a declared decision, not a silent omission.',
    grant: {
      _tag: 'TypeRefusalFixtures',
      files: [
        'packages/runner/vitest-conformance/tests/__fixtures__/**',
        'packages/gherkin/effect-gherkin-spec/tests/__fixtures__/**',
        'packages/gherkin/storybook-gherkin/test/browser/scenario-title.deny.ts',
      ],
    },
  },
  {
    name: 'patch-rolldown-dts-export-marker',
    owner: '@ryanleecode',
    reason:
      'rolldown-plugin-dts 0.28.6 is patched to emit the `export {}` marker on module .d.ts chunks: without it a published declaration re-exports every local type, so a chunk no longer exports only what it declares. From #624.',
    grant: {
      _tag: 'ThirdPartyPatch',
      dependency: 'rolldown-plugin-dts@0.28.6',
      patch: 'patches/rolldown-plugin-dts@0.28.6.patch',
      recheck:
        'any rolldown-plugin-dts or tsdown upgrade must re-run packages/toolchain/tsdown-config/tests/dts-export-marker.test.ts and drop the patch once upstream emits the marker.',
    },
  },
  {
    name: 'patch-drizzle-orm-effect-sql-specifiers',
    owner: '@ryanleecode',
    reason:
      'drizzle-orm 1.0.0-rc.5-5935859 declarations still import `effect/unstable/sql`, which Effect 4 flattened to `effect/sql`; the patch rewrites those specifiers so a drizzle-orm importer typechecks. From #571.',
    grant: {
      _tag: 'ThirdPartyPatch',
      dependency: 'drizzle-orm@1.0.0-rc.5-5935859',
      patch: 'patches/drizzle-orm@1.0.0-rc.5-5935859.patch',
      recheck:
        'any drizzle-orm upgrade must typecheck @systemfsoftware/effect-unit-of-work (and every other drizzle importer) without the patch and drop it once the published declarations import effect/sql.',
    },
  },
]
