/**
 * The committed specifier map (plan KTD5.3): every upstream package specifier a
 * suite file can import, mapped to the fork source entry it resolves to. The map
 * carries xstate specifiers only — additive `zod`/`vue`/`solid` cases are the
 * layer that retires them. Adding a mapping is an Evaluator change.
 *
 * Pure data plus two pure lookups; no I/O (CONST-B1).
 */
import { Option } from 'effect'
import { dual } from 'effect/Function'

/** The six forked upstream package directories, by their upstream name. */
export const UPSTREAM_DIRS = [
  'core',
  'xstate-effect',
  'xstate-test',
  'xstate-react',
  'xstate-store',
  'xstate-store-react',
] as const

/** An upstream package directory name. */
export type UpstreamDir = (typeof UPSTREAM_DIRS)[number]

/** Upstream directory name -> fork directory name under `packages/xstate/`. */
export const FORK_DIR: Readonly<Record<UpstreamDir, string>> = {
  core: 'xstate',
  'xstate-effect': 'xstate-effect',
  'xstate-test': 'xstate-test',
  'xstate-react': 'xstate-react',
  'xstate-store': 'xstate-store',
  'xstate-store-react': 'xstate-store-react',
}

/**
 * Upstream specifier -> fork source file, relative to the repository root.
 * `@xstate/test/schema` is present because U4 holds the suite as it is at the
 * pin; the layer that deletes zod (U14) removes both the source and this entry.
 */
export const SPECIFIER_MAP: Readonly<Record<string, string>> = {
  'xstate': 'packages/xstate/xstate/src/index.ts',
  'xstate/actors': 'packages/xstate/xstate/src/actors/index.ts',
  'xstate/durable': 'packages/xstate/xstate/src/durable/index.ts',
  'xstate/fsm': 'packages/xstate/xstate/src/fsm/index.ts',
  'xstate/graph': 'packages/xstate/xstate/src/graph/index.ts',
  'xstate/validation': 'packages/xstate/xstate/src/validation/index.ts',
  '@xstate/effect': 'packages/xstate/xstate-effect/src/index.ts',
  '@xstate/effect/atom': 'packages/xstate/xstate-effect/src/atom.ts',
  '@xstate/store': 'packages/xstate/xstate-store/src/index.ts',
  '@xstate/store/persist': 'packages/xstate/xstate-store/src/persist.ts',
  '@xstate/store/reset': 'packages/xstate/xstate-store/src/reset.ts',
  '@xstate/store/undo': 'packages/xstate/xstate-store/src/undo.ts',
  '@xstate/store/validate': 'packages/xstate/xstate-store/src/validate.ts',
  '@xstate/test': 'packages/xstate/xstate-test/src/index.ts',
  '@xstate/test/effect-schema': 'packages/xstate/xstate-test/src/effect-schema.ts',
  '@xstate/test/playwright': 'packages/xstate/xstate-test/src/playwright.ts',
  '@xstate/test/schema': 'packages/xstate/xstate-test/src/schema.ts',
  '@xstate/test/vitest': 'packages/xstate/xstate-test/src/vitest.ts',
  '@xstate/react': 'packages/xstate/xstate-react/src/index.ts',
  '@xstate/store-react': 'packages/xstate/xstate-store-react/src/index.ts',
}

/** The upstream package a suite-relative file belongs to, or `undefined`. */
export const upstreamDirOfSuitePath = (file: string): UpstreamDir | undefined =>
  UPSTREAM_DIRS.find((dir) => file.split('/')[0] === dir)

/**
 * The fork source path, relative to the repository root, for a path relative to
 * an upstream package root. `undefined` when the path is not under that
 * package's `src/` (a fixture or sibling helper, which the suite carries
 * itself). The caller probes extensions, because upstream writes both `../src`
 * (the directory) and `../src/types.v6` (no extension).
 */
const INDEX_FORM = { matches: (value: string) => value === 'src', path: () => 'src/index.ts' }

const SOURCE_FORMS: ReadonlyArray<{
  readonly matches: (value: string) => boolean
  readonly path: (value: string) => string
}> = [INDEX_FORM, { matches: (value) => value.startsWith('src/'), path: (value) => value }]

/** The fork-relative source path a suite-relative path names, or `undefined` for a non-source import. */
const forkSourceOf = (packageRelative: string): string | undefined =>
  Option.match(Option.fromNullishOr(SOURCE_FORMS.find((form) => form.matches(packageRelative))), {
    onNone: () => undefined,
    onSome: (form) => form.path(packageRelative),
  })

/**
 * The fork source path, relative to the repository root, for a path relative to
 * an upstream package root. `undefined` when the path is not under that
 * package's `src/` (a fixture or sibling helper, which the suite carries
 * itself). The caller probes extensions, because upstream writes both `../src`
 * (the directory) and `../src/types.v6` (no extension). Data-last, so it pipes
 * over the package-relative path.
 */
export const forkPathFor: {
  (packageRelative: string): (upstreamDir: UpstreamDir) => string | undefined
  (upstreamDir: UpstreamDir, packageRelative: string): string | undefined
} = dual(
  2,
  (upstreamDir: UpstreamDir, packageRelative: string): string | undefined =>
    Option.match(Option.fromNullishOr(forkSourceOf(packageRelative)), {
      onNone: () => undefined,
      onSome: (source) => `packages/xstate/${FORK_DIR[upstreamDir]}/${source}`,
    }),
)
