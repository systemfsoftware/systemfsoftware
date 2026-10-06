# @systemfsoftware/opt-in

Per-package opt-ins for the repo's shared guards: every allowance a package takes — an oxlint rule scoped to
some files, an `@effect/tsgo` diagnostic a role does not carry, an unstable API it uses — is one decoded,
owned, argued value. Pure renderers project that vocabulary into oxlint overrides and the
`@effect/language-service` plugin block; the `opt-in sync` CLI writes the block into a package's tsconfig.

## Installation

```bash
pnpm add @systemfsoftware/opt-in
```

## Usage

Declare a package's opt-ins in `opt-ins.ts` next to its `package.json`:

```typescript
export default [
  {
    name: 'allow-unstable-api',
    owner: '@ryan',
    reason: 'The scheduler API is unstable but is the only one that fits this wait.',
    grant: { _tag: 'UnstableApi', api: 'effect/Scheduler' },
  },
]
```

Then write the rendered block into the tsconfigs whose `extends` name the Effect presets:

```bash
opt-in sync --dir packages/my-package
opt-in sync --check --dir packages/my-package
```

A diagnostic exclusion is scoped to the files it names. `role` picks the preset whose diagnostics it
narrows, and `files` are tsconfig-relative globs, the same shape an `OxlintExclusion` uses:

```typescript
export default [
  {
    name: 'allow-global-date-in-the-clock-adapter',
    owner: '@ryan',
    reason: 'The adapter is the one seam that reads the clock before the Effect runtime starts.',
    grant: { _tag: 'DiagnosticExclusion', diagnostic: 'globalDate', role: 'library', files: ['src/clock.ts'] },
  },
]
```

`renderEffectPlugin` renders each matching exclusion as an `overrides` entry — `include` the exclusion's
`files`, `options.diagnosticSeverity` the diagnostic at `off` — rather than deleting the diagnostic from
the block. effect-tsgo merges `diagnosticSeverity` by name across the `extends` chain, so a deletion is a
no-op; an override is what actually suppresses the diagnostic, and only in the files it includes. The
plugin's `overrides` list is ordered and a later entry wins for the files it matches, so the rendered
exclusions are appended after any `overrides` already on the base block.

`opt-ins.ts` is loaded with a dynamic `import`, so Node's TypeScript type stripping applies: it must use
erasable TypeScript only — no enums, parameter properties, or namespaces.

A `TestProcessSpawn` declares that a test file spawns a process, an allowance no renderer projects. It
names the `rule` it waives and the `files` that spawn, and the debt ledger lists it as a Declared grant:

```typescript
export default [
  {
    name: 'test-spawns-the-tool-binary',
    owner: '@ryan',
    reason: 'The tool is a native binary with no in-process API, so only running it exercises the preset.',
    grant: { _tag: 'TestProcessSpawn', files: ['tests/tool.integration.test.ts'], rule: 'WGI-CLS1' },
  },
]
```

A `PresetNarrowing` declares a scope a published oxlint configuration takes: a rule the configuration
enables only inside some overrides, withholds from some globs, or enables with an option that exempts
names or paths. It names the `rule` and the `files` globs the narrowing covers — empty when the
narrowing is an option rather than a path scope. The preset package that owns the configuration declares
it, so the debt ledger can list every narrowing the presets take and fail on an undeclared one:

```typescript
export default [
  {
    name: 'complexity-skips-tests',
    owner: '@ryan',
    reason: 'Test bodies arrange fixtures and assert sequences, so the source complexity ceiling cannot hold there.',
    grant: { _tag: 'PresetNarrowing', rule: 'complexity', files: ['**/*.test.ts', '**/*.spec.ts'] },
  },
]
```

The renderers are pure and can be used directly:

```typescript
import { oxlintExcludeFiles, oxlintOverrides, renderEffectPlugin } from '@systemfsoftware/opt-in'

const overrides = oxlintOverrides(optIns)
const excluded = oxlintExcludeFiles(optIns, 'no-console')
const block = renderEffectPlugin('library', base, optIns)
```

## License

Apache-2.0
