import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface FixtureFile {
  readonly path: string
  readonly contents: string
}

export interface FixturePackage {
  readonly prefix: string
  readonly name: string
  readonly files: readonly FixtureFile[]
  readonly testScript?: string
  readonly noTsconfig?: true
  readonly declarationKinds?: true
}

const TEMP_ROOT = resolve(process.cwd(), 'temp')

const manifestOf = (name: string, source: boolean, testScript: string | undefined): string =>
  JSON.stringify({
    name,
    type: 'module',
    exports: {
      '.': source
        ? { '@systemfsoftware/source': './src/mod.ts' }
        : { types: './dist/index.d.ts', default: './dist/index.js' },
    },
    ...(testScript === undefined ? {} : { scripts: { test: testScript } }),
  }) + '\n'

const TSCONFIG = {
  compilerOptions: {
    moduleResolution: 'bundler',
    module: 'preserve',
    target: 'esnext',
    customConditions: ['@systemfsoftware/source'],
    strict: false,
    skipLibCheck: true,
    noEmit: true,
    allowJs: false,
    types: [],
  },
}

const DECLARATION_TSCONFIG = {
  compilerOptions: { ...TSCONFIG.compilerOptions, customConditions: [] },
}

export const sourceKinds = (): readonly FixtureFile[] => [
  {
    path: 'node_modules/@systemfsoftware/effect-cell-types/package.json',
    contents: manifestOf('@systemfsoftware/effect-cell-types', true, undefined),
  },
  { path: 'node_modules/@systemfsoftware/effect-cell-types/src/Cell.ts', contents: CELL_SOURCE },
  { path: 'node_modules/@systemfsoftware/effect-cell-types/src/Blueprint.ts', contents: BLUEPRINT_SOURCE },
  { path: 'node_modules/@systemfsoftware/effect-cell-types/src/Handle.ts', contents: HANDLE_SOURCE },
  { path: 'node_modules/@systemfsoftware/effect-cell-types/src/Sandwich.ts', contents: SANDWICH_SOURCE },
  { path: 'node_modules/@systemfsoftware/effect-cell-types/src/mod.ts', contents: CELL_TYPES_MOD },
  {
    path: 'node_modules/@systemfsoftware/effect-daemon-spec/package.json',
    contents: manifestOf('@systemfsoftware/effect-daemon-spec', true, undefined),
  },
  { path: 'node_modules/@systemfsoftware/effect-daemon-spec/src/Supervisor/Medium.ts', contents: MEDIUM_SOURCE },
  {
    path: 'node_modules/@systemfsoftware/effect-daemon-spec/src/Supervisor/mod.ts',
    contents: "export * as Medium from './Medium.js'\n",
  },
  {
    path: 'node_modules/@systemfsoftware/effect-daemon-spec/src/mod.ts',
    contents: "export * as Supervisor from './Supervisor/mod.js'\n",
  },
  {
    path: 'node_modules/@systemfsoftware/conformance-spec/package.json',
    contents: manifestOf('@systemfsoftware/conformance-spec', true, undefined),
  },
  { path: 'node_modules/@systemfsoftware/conformance-spec/src/Conformance/mod.ts', contents: CONFORMANCE_SOURCE },
  {
    path: 'node_modules/@systemfsoftware/conformance-spec/src/mod.ts',
    contents: "export * as Conformance from './Conformance/mod.js'\n",
  },
]

export const declarationKinds = (): readonly FixtureFile[] => [
  {
    path: 'node_modules/@systemfsoftware/effect-cell-types/package.json',
    contents: manifestOf('@systemfsoftware/effect-cell-types', false, undefined),
  },
  { path: 'node_modules/@systemfsoftware/effect-cell-types/dist/index.d.ts', contents: CELL_TYPES_DECLARATION },
  {
    path: 'node_modules/@systemfsoftware/conformance-spec/package.json',
    contents: manifestOf('@systemfsoftware/conformance-spec', false, undefined),
  },
  { path: 'node_modules/@systemfsoftware/conformance-spec/dist/index.d.ts', contents: CONFORMANCE_DECLARATION },
]

export const declarationTsconfig = (): string => JSON.stringify(DECLARATION_TSCONFIG)

export const cleanupFixtures = (roots: readonly string[]): void => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
}

export const writeFixture = (fixture: FixturePackage): string => {
  const root = mkdtempSync(join(TEMP_ROOT, fixture.prefix))
  const kinds = fixture.declarationKinds === true ? declarationKinds() : sourceKinds()
  const tsconfig = fixture.declarationKinds === true ? DECLARATION_TSCONFIG : TSCONFIG
  const config: FixtureFile[] = fixture.noTsconfig === true
    ? []
    : [{ path: 'tsconfig.json', contents: JSON.stringify(tsconfig) }]
  const files: readonly FixtureFile[] = [
    { path: 'package.json', contents: manifestOf(fixture.name, true, fixture.testScript) },
    ...config,
    ...fixture.files,
    ...kinds,
  ]
  for (const file of files) {
    const target = join(root, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.contents)
  }
  return root
}

const CELL_SOURCE = `export const CellTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Cell')
export interface Cell<I> {
  readonly [CellTypeId]: CellTypeId
  readonly run: (input: I) => unknown
}
export const id = <I>(): Cell<I> => ({ [CellTypeId]: CellTypeId, run: (input: I) => input })
`

const BLUEPRINT_SOURCE = `export interface Blueprint<T extends symbol, Spec> {
  readonly spec: Spec
  readonly typeId: T
}
export interface Definition<T extends symbol, Spec> {
  readonly spec: Spec
  readonly typeId: T
}
`

const HANDLE_SOURCE = `export interface Handle<T extends symbol, Data extends object> {
  readonly typeId: T
}
export interface Definition<T extends symbol, Data extends object> {
  readonly typeId: T
}
`

const SANDWICH_SOURCE = `import { type Cell, id } from './Cell.js'
export type WrittenCell<I, A> = Cell<I> & { readonly phases: readonly string[]; readonly response: A }
export interface DecidedChain<I> {
  readonly 'write': (handlers: object) => WrittenCell<I, unknown>
}
export interface ReadChain<I> {
  readonly 'decide': (workflow: unknown) => DecidedChain<I>
}
export const named = (_name: string) =>
<I,>(_read: (command: I) => unknown): ReadChain<I> => ({
  decide: (_workflow: unknown) => ({
    write: (_handlers: object): WrittenCell<I, unknown> => ({ ...id<I>(), phases: ['read'], response: undefined }),
  }),
})
`

const MEDIUM_SOURCE = `export interface MediumOptions<Program> {
  readonly program: Program
}
export type Medium<Program> = MediumOptions<Program>
export type MediumPortShape<Program> = { readonly medium: Medium<Program> }
`

const CELL_TYPES_MOD =
  "export * as Blueprint from './Blueprint.js'\nexport * as Cell from './Cell.js'\nexport * as Handle from './Handle.js'\nexport * as Sandwich from './Sandwich.js'\n"

const CONFORMANCE_SOURCE = `export const stopped = (_unit: unknown): void => {}
export const released = (_program: unknown): void => {}
`

const CELL_TYPES_DECLARATION = `declare namespace Cell {
  interface Cell<I> {
    readonly run: (input: I) => unknown
  }
  const id: <I>() => Cell<I>
}
declare namespace Blueprint {
  interface Blueprint<T extends symbol, Spec> {
    readonly spec: Spec
    readonly typeId: T
  }
  interface Definition<T extends symbol, Spec> {
    readonly spec: Spec
    readonly typeId: T
  }
}
declare namespace Handle {
  interface Handle<T extends symbol, Data extends object> {
    readonly typeId: T
  }
  interface Definition<T extends symbol, Data extends object> {
    readonly typeId: T
  }
}
export { Blueprint, Cell, Handle }
`

const CONFORMANCE_DECLARATION = `declare namespace Conformance {
  const stopped: (unit: unknown) => void
  const released: (program: unknown) => void
}
export { Conformance }
`
