import * as fc from 'fast-check'

export interface ParityFile {
  readonly path: string
  readonly contents: string
}

export interface ParityPackage {
  readonly name: string
  readonly configPath: string
  readonly files: ReadonlyArray<ParityFile>
}

type DeclarationKind = 'interface' | 'typeAlias' | 'function' | 'class' | 'enum' | 'const' | 'namespace'

type ReleaseTag = 'public' | 'beta' | 'alpha' | 'internal'

interface DeclarationSpec {
  readonly kind: DeclarationKind
  readonly tag: ReleaseTag | undefined
  readonly documented: boolean
}

interface Declaration extends DeclarationSpec {
  readonly name: string
  readonly body: string
}

const declarationKinds: fc.Arbitrary<DeclarationKind> = fc.constantFrom<DeclarationKind>(
  'interface',
  'typeAlias',
  'function',
  'class',
  'enum',
  'const',
  'namespace',
)

const releaseTags: fc.Arbitrary<ReleaseTag> = fc.constantFrom<ReleaseTag>('public', 'beta', 'alpha', 'internal')

const declarationSpecs: fc.Arbitrary<DeclarationSpec> = fc.record({
  kind: declarationKinds,
  tag: fc.option(releaseTags, { nil: undefined }),
  documented: fc.boolean(),
})

const concreteType: fc.Arbitrary<string> = fc.constantFrom('string', 'number', 'boolean')

const typeVariable = 'T'

const functionReturnType: fc.Arbitrary<string> = fc.constantFrom('string', 'number', 'boolean', 'void')

const parameterListOf = (types: fc.Arbitrary<string>): fc.Arbitrary<string> =>
  fc.array(types, { minLength: 0, maxLength: 3 }).map((drawn) =>
    drawn.map((type, index) => `input${index}: ${type}`).join(', ')
  )

const functionBody = (name: string): fc.Arbitrary<string> =>
  fc.boolean().chain((generic) =>
    fc.tuple(
      parameterListOf(generic ? fc.constantFrom('string', 'number', typeVariable) : concreteType),
      generic ? fc.constantFrom('string', 'number', typeVariable) : functionReturnType,
    ).map(([parameters, returns]) =>
      `export declare function ${name}${generic ? `<${typeVariable}>` : ''}(${parameters}): ${returns};`
    )
  )

const interfaceBody = (name: string): fc.Arbitrary<string> =>
  fc.boolean().chain((generic) =>
    fc.array(generic ? fc.constantFrom('string', 'number', typeVariable) : concreteType, {
      minLength: 1,
      maxLength: 3,
    }).map((properties) =>
      `export interface ${name}${generic ? `<${typeVariable}>` : ''} {\n${
        properties.map((type, index) => `  readonly field${index}: ${type};`).join('\n')
      }\n}`
    )
  )

const typeAliasBody = (name: string): fc.Arbitrary<string> =>
  fc.constantFrom(
    `export type ${name} = string;`,
    `export type ${name} = ReadonlyArray<string>;`,
    `export type ${name} = string | undefined;`,
    `export type ${name}<${typeVariable}> = ${typeVariable};`,
    `export type ${name}<${typeVariable}> = ${typeVariable} | undefined;`,
    `export type ${name}<${typeVariable}> = ReadonlyArray<${typeVariable}>;`,
  )

const classBody = (name: string): fc.Arbitrary<string> =>
  fc.constantFrom(
    `export declare class ${name} {\n  readonly id: string;\n  constructor(id: string);\n}`,
    `export declare class ${name}<${typeVariable}> {\n  readonly value: ${typeVariable};\n  constructor(value: ${typeVariable});\n}`,
    `export declare class ${name} {\n  method(input: number): string;\n  method(input: string): number;\n}`,
    `export declare class ${name} {\n  readonly id: number;\n  method(input: boolean): void;\n}`,
  )

const enumBody = (name: string): fc.Arbitrary<string> =>
  fc.constantFrom(
    `export declare enum ${name} {\n  A = 0,\n  B = 1,\n}`,
    `export declare enum ${name} {\n  First = "first",\n  Second = "second",\n}`,
  )

const constBody = (name: string): fc.Arbitrary<string> =>
  fc.constantFrom(
    `export declare const ${name}: { readonly kind: string };`,
    `export declare const ${name}: ReadonlyArray<number>;`,
    `export declare const ${name}: number;`,
  )

const namespaceBody = (name: string): fc.Arbitrary<string> =>
  fc.constantFrom(
    `export declare namespace ${name} {\n  function helper(x: number): number;\n}`,
    `export declare namespace ${name} {\n  const value: string;\n}`,
  )

const bodies: Readonly<Record<DeclarationKind, (name: string) => fc.Arbitrary<string>>> = {
  interface: interfaceBody,
  typeAlias: typeAliasBody,
  function: functionBody,
  class: classBody,
  enum: enumBody,
  const: constBody,
  namespace: namespaceBody,
}

const declarationNamed = (spec: DeclarationSpec, name: string): fc.Arbitrary<Declaration> =>
  bodies[spec.kind](name).map((body): Declaration => ({ ...spec, name, body }))

const declarationsNamed = (prefix: string): fc.Arbitrary<ReadonlyArray<Declaration>> =>
  fc.array(declarationSpecs, { minLength: 1, maxLength: 3 }).chain((specs) =>
    fc.tuple(...specs.map((spec, index) => declarationNamed(spec, `${prefix}${index}`)))
  )

const commentOf = (spec: DeclarationSpec): string => {
  const requested = [
    spec.documented ? ' * Generated declaration.' : '',
    spec.tag === undefined ? '' : ` * @${spec.tag}`,
  ].filter((line) => line !== '')
  return requested.length === 0 ? '' : `/**\n${requested.join('\n')}\n */\n`
}

const rendered = (declaration: Declaration): string => `${commentOf(declaration)}${declaration.body}`

const otherModule = (declarations: ReadonlyArray<Declaration>): string =>
  ['export type Forgotten = { readonly token: unique symbol };', ...declarations.map(rendered)].join('\n\n') + '\n'

const indexModule = (declarations: ReadonlyArray<Declaration>, reexported: ReadonlyArray<string>): string =>
  [
    "import type { Forgotten } from './other.js';",
    `export { ${reexported.join(', ')} } from './other.js';`,
    ...declarations.map(rendered),
    '/** @public */\nexport declare function useForgotten(): Forgotten;',
  ].join('\n\n') + '\n'

const manifest = `{
  "name": "gen-pkg",
  "version": "1.0.0",
  "types": "lib/index.d.ts"
}
`

const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "files": [
    "lib/index.d.ts",
    "lib/other.d.ts"
  ]
}
`

const extractorConfig = `{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "mainEntryPointFilePath": "<projectFolder>/lib/index.d.ts",
  "compiler": {
    "tsconfigFilePath": "<projectFolder>/tsconfig.json"
  },
  "apiReport": {
    "enabled": true,
    "reportFileName": "gen-pkg.api.md",
    "reportFolder": "<projectFolder>/etc/",
    "reportTempFolder": "<projectFolder>/temp/",
    "reportVariants": [
      "complete",
      "public",
      "beta"
    ]
  },
  "docModel": {
    "enabled": false
  },
  "dtsRollup": {
    "enabled": true,
    "untrimmedFilePath": "<projectFolder>/dist/gen-pkg.d.ts",
    "publicTrimmedFilePath": "<projectFolder>/dist/gen-pkg.public.d.ts"
  }
}
`

export const generatedDeclarationPackage: fc.Arbitrary<ParityPackage> =
  fc.tuple(declarationsNamed('O'), declarationsNamed('I')).map(([other, index]) => ({
    name: 'gen-pkg',
    configPath: 'api-extractor.json',
    files: [
      { path: 'api-extractor.json', contents: extractorConfig },
      { path: 'package.json', contents: manifest },
      { path: 'tsconfig.json', contents: tsconfig },
      { path: 'etc/.gitkeep', contents: '' },
      { path: 'lib/other.d.ts', contents: otherModule(other) },
      { path: 'lib/index.d.ts', contents: indexModule(index, other.map((declaration) => declaration.name)) },
    ],
  }))
