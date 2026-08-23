import { createPackage } from '@systemfsoftware/npm-package'

/**
 * Synthetic problem-class recipes — one per {@link Problem} kind plus
 * a types-companion pair and a known-bad tree.
 *
 * Each entry is a function returning a {@link Package} via the published
 * {@link createPackage} constructor so callers can build fresh instances.
 * The record is the single stability surface for recipe identity; individual
 * kind names are not separate exports.
 */
export const recipes = {
  /** Types file is CJS, implementation is ESM → FalseCJS. */
  FalseCJS: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'false-cjs',
          version: '1.0.0',
          main: './dist/index.cjs',
          types: './dist/index.d.ts',
          exports: {
            '.': {
              types: './dist/index.d.ts',
              import: './dist/index.mjs',
              require: './dist/index.cjs',
            },
          },
        }),
        'dist/index.d.ts': 'export declare const foo: string;\n',
        'dist/index.cjs': 'module.exports = { foo: "bar" };\nmodule.exports.foo = "bar";\n',
        'dist/index.mjs': 'export const foo = "bar";\nexport default {};\n',
      },
      'false-cjs',
      '1.0.0',
    ),

  /** Types file is ESM, implementation is CJS → FalseESM. */
  FalseESM: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'false-esm',
          version: '1.0.0',
          type: 'module',
          main: './dist/index.mjs',
          types: './dist/index.d.ts',
          exports: {
            '.': {
              types: './dist/index.d.ts',
              import: './dist/index.mjs',
              require: './dist/index.cjs',
            },
          },
        }),
        'dist/index.d.ts': 'export declare const foo: string;\n',
        'dist/index.cjs': '"use strict";\nmodule.exports = { foo: "bar" };\n',
        'dist/index.mjs': 'export const foo = "bar";\n',
      },
      'false-esm',
      '1.0.0',
    ),

  /** Node16 CJS resolution lands on an ESM file → CJSResolvesToESM. */
  CJSResolvesToESM: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'cjs-resolves-to-esm',
          version: '1.0.0',
          type: 'module',
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: {
            '.': './dist/index.js',
          },
        }),
        'dist/index.js': 'export const x = 1;\n',
        'dist/index.d.ts': 'export declare const x: number;\n',
      },
      'cjs-resolves-to-esm',
      '1.0.0',
    ),

  /** Types has named exports missing in ESM impl → NamedExports. */
  NamedExports: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'named-exports',
          version: '1.0.0',
          main: './dist/index.cjs',
          types: './dist/index.d.ts',
          exports: {
            '.': {
              types: './dist/index.d.ts',
              import: './dist/index.js',
              require: './dist/index.cjs',
            },
          },
        }),
        'dist/index.d.ts':
          'export declare const a: string;\nexport declare const b: string;\nexport declare const c: string;\n',
        'dist/index.cjs': 'module.exports = { a: "a", b: "b", c: "c" };\n',
        'dist/index.js': 'module.exports = { a: "a" };\n',
      },
      'named-exports',
      '1.0.0',
    ),

  /** Resolution fell through a conditional export fallback → FallbackCondition. */
  FallbackCondition: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'fallback-condition',
          version: '1.0.0',
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: {
            '.': {
              types: './dist/missing.d.ts',
              default: './dist/index.js',
            },
          },
        }),
        'dist/index.js': 'module.exports = { x: 1 };\n',
        'dist/index.d.ts': 'export {};\n',
      },
      'fallback-condition',
      '1.0.0',
    ),

  /** Types has default, impl lacks default → FalseExportDefault. */
  FalseExportDefault: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'false-export-default',
          version: '1.0.0',
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: {
            '.': './dist/index.js',
          },
        }),
        'dist/index.d.ts': 'declare const foo: string;\nexport default foo;\n',
        'dist/index.js': 'module.exports = { notDefault: 1 };\n',
      },
      'false-export-default',
      '1.0.0',
    ),

  /** Types lacks `export =` but impl has it (callable) → MissingExportEquals. */
  MissingExportEquals: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'missing-export-equals',
          version: '1.0.0',
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: {
            '.': './dist/index.js',
          },
        }),
        'dist/index.d.ts': 'declare function foo(): void;\nexport default foo;\n',
        'dist/index.js': 'function foo() {}\nmodule.exports = foo;\nmodule.exports.default = foo;\n',
      },
      'missing-export-equals',
      '1.0.0',
    ),

  /** Internal relative import fails to resolve → InternalResolutionError. */
  InternalResolutionError: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'internal-resolution-error',
          version: '1.0.0',
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: {
            '.': './dist/index.js',
          },
        }),
        'dist/index.d.ts': 'import { x } from "./does-not-exist.js";\nexport {};\n',
        'dist/index.js': 'module.exports = {};\n',
      },
      'internal-resolution-error',
      '1.0.0',
    ),

  /** File syntax disagrees with its detected module kind → UnexpectedModuleSyntax. */
  UnexpectedModuleSyntax: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'unexpected-module-syntax',
          version: '1.0.0',
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: {
            '.': './dist/index.js',
          },
        }),
        'dist/index.js': 'export const foo = 1;\n',
        'dist/index.d.ts': 'export declare const foo: number;\n',
      },
      'unexpected-module-syntax',
      '1.0.0',
    ),

  /** CJS file seen only via ESM resolution has `module.exports.default` → CJSOnlyExportsDefault. */
  CJSOnlyExportsDefault: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'cjs-only-exports-default',
          version: '1.0.0',
          type: 'module',
          main: './dist/require.cjs',
          types: './dist/index.d.cts',
          exports: {
            '.': {
              types: './dist/index.d.cts',
              import: './dist/import.cjs',
              require: './dist/require.cjs',
            },
          },
        }),
        'dist/import.cjs':
          '"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.default = 42;\n',
        'dist/require.cjs': 'module.exports = { foo: 1 };\n',
        'dist/index.d.cts': 'export {};\n',
      },
      'cjs-only-exports-default',
      '1.0.0',
    ),

  /** Entrypoint resolves to nothing → NoResolution. */
  NoResolution: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'no-resolution',
          version: '1.0.0',
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: {
            '.': './dist/missing.js',
          },
        }),
        'dist/index.d.ts': 'export declare const x: number;\n',
        'dist/index.js': 'export const x = 1;\n',
      },
      'no-resolution',
      '1.0.0',
    ),

  /** Entrypoint resolves to JS without types → UntypedResolution. */
  UntypedResolution: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'untyped-resolution',
          version: '1.0.0',
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: {
            '.': './dist/index.js',
          },
        }),
        'dist/index.js': 'module.exports = { x: 1 };\n',
        'other.d.ts': 'export declare const y: number;\n',
      },
      'untyped-resolution',
      '1.0.0',
    ),

  /** Main package of the types-companion pair (no types of its own). */
  TypesCompanion: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'types-companion',
          version: '1.0.0',
          main: './dist/index.js',
        }),
        'dist/index.js': 'module.exports = { foo: "bar" };\n',
      },
      'types-companion',
      '1.0.0',
    ),

  /** types companion for the pair above. */
  TypesCompanionTypes: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: '@types/types-companion',
          version: '1.0.0',
        }),
        'index.d.ts': 'declare module "types-companion" { export const foo: string; }\n',
      },
      '@types/types-companion',
      '1.0.0',
    ),

  /** Analysis rejects this tree (invalid package.json) → Result.fail. */
  KnownBad: () =>
    createPackage(
      {
        'package.json': '{"name":"known-bad","version":"1.0.0",}',
        'index.js': 'module.exports = {};\n',
        'index.d.ts': 'export {};\n',
      },
      'known-bad',
      '1.0.0',
    ),

  /** Multiple entrypoints including `macros` for CLI contract lane. */
  MultiEntrypoint: () =>
    createPackage(
      {
        'package.json': JSON.stringify({
          name: 'multi-entrypoint',
          version: '1.0.0',
          exports: {
            '.': {
              types: './dist/index.d.ts',
              default: './dist/index.js',
            },
            './macros': {
              types: './dist/macros.d.ts',
              default: './dist/macros.js',
            },
            './utils': {
              types: './dist/utils.d.ts',
              default: './dist/utils.js',
            },
          },
        }),
        'dist/index.js': 'module.exports = { a: 1 };\n',
        'dist/index.d.ts': 'export declare const a: number;\n',
        'dist/macros.js': 'module.exports = { m: 1 };\n',
        'dist/macros.d.ts': 'export declare const m: number;\n',
        'dist/utils.js': 'module.exports = { u: 1 };\n',
        'dist/utils.d.ts': 'export declare const u: number;\n',
      },
      'multi-entrypoint',
      '1.0.0',
    ),
}
