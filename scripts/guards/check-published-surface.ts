#!/usr/bin/env -S deno run --allow-read

const SHAPE_TYPE = /^(?:Schema\.|Layer\.Layer|Context\.Reference|Metric\.|unique symbol)|=>\s*Layer\.Layer/
const PLUGIN_DEFAULT = /^export default/
const MANIFEST_CONST = /^(?:strykerPlugins)$/

const FREE_FUNCTIONS: Readonly<Record<string, string>> = {
  boundedUnion: 'constructs a bounded-union schema — construct affordance',
  cappedBackoff: 'constructs a Schedule — construct affordance',
  findExportedSchemas: 'constructs the schema inventory — construct affordance',
  fromObservable: 'constructs a Stream from an Observable — construct affordance',
  generateSchemaLaws: 'constructs law-file text — construct affordance',
  identityOf: 'pure projection of a schema identity — compose affordance',
  inlineSchemaTests: 'constructs the vite plugin — construct affordance',
  layerWith: 'binding layer constructor — binding affordance',
  leader: 'constructs a leader supervision strategy — construct affordance',
  make: 'constructs the in-memory filesystem — construct affordance',
  oneForAll: 'constructs a supervision strategy — construct affordance',
  oneForOne: 'constructs a supervision strategy — construct affordance',
  poll: 'constructs a supervision poll — construct affordance',
  quote: 'pure projection — compose affordance',
  restForOne: 'constructs a supervision strategy — construct affordance',
  ruleOfSchemas: 'constructs a mutation obligation — construct affordance',
  supervision: 'constructs a supervision budget — construct affordance',
  supervisor: 'constructs a supervisor — construct affordance',
  task: 'constructs a task budget — construct affordance',
  withLeaderLock: 'constructs the leader-lock layer — binding affordance',
}

const FREE_CONSTS: Readonly<Record<string, string>> = {
  LAW_FILE_BASENAME: 'inert vocabulary constant — the law calls it allowed',
  plugins: 'preset data — inert constant',
  overrides: 'preset data — inert constant',
  rules: 'preset data — inert constant',
  options: 'preset data — inert constant',
  testContributionEvaluatorLayer: 'binding layer — binding affordance',
}

type Finding = {
  readonly file: string
  readonly line: number
  readonly symbol: string
  readonly reason: string
}

export const classify = (
  file: string,
  lines: readonly string[],
): { readonly findings: readonly Finding[]; readonly exported: number } => {
  const findings: Finding[] = []
  let exported = 0
  let symbol = ''
  let classDepth = 0
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim()
    if (classDepth > 0) {
      if (/:\s*(?:Effect\.|Promise[<.])/.test(line)) {
        findings.push({
          file,
          line: index + 1,
          symbol,
          reason: 'a published member carries an Effect or Promise — data does not build effects',
        })
      }
      for (const ch of raw) {
        if (ch === '{') classDepth += 1
        if (ch === '}') classDepth -= 1
      }
      continue
    }
    const classMatch = /^export (?:declare )?class (\w+)/.exec(line)
    if (classMatch !== null) {
      symbol = classMatch[1]
      exported += 1
      for (const ch of raw) {
        if (ch === '{') classDepth += 1
        if (ch === '}') classDepth -= 1
      }
      continue
    }
    if (/^export (?:namespace|type|interface|declare class)/.test(line)) {
      exported += 1
      continue
    }
    if (PLUGIN_DEFAULT.test(line)) {
      exported += 1
      continue
    }
    const fnMatch = /^export (?:declare )?function (\w+)/.exec(line)
    if (fnMatch !== null) {
      const name = fnMatch[1]
      exported += 1
      if (!(name in FREE_FUNCTIONS)) {
        findings.push({ file, line: index + 1, symbol: name, reason: 'free function outside an algebra namespace' })
      }
      continue
    }
    const constMatch = /^export (?:declare )?const (\w+)(?::\s*(.*?))?[;=]/.exec(line)
    if (constMatch !== null) {
      const name = constMatch[1]
      const type = constMatch[2] ?? ''
      exported += 1
      const shapeTyped = SHAPE_TYPE.test(type)
      const manifest = MANIFEST_CONST.test(name)
      const reasoned = name in FREE_CONSTS || name in FREE_FUNCTIONS
      if (!shapeTyped && !manifest && !reasoned) {
        findings.push({
          file,
          line: index + 1,
          symbol: name,
          reason: `free constant of type ${
            type.slice(0, 40)
          } — neither schema, layer, manifest, nor reasoned exception`,
        })
      }
      continue
    }
  }
  return { findings, exported }
}

const codeBlockLines = (text: string): readonly string[] => {
  const fenced = text.split('\n').filter((line) => !line.startsWith('```'))
  return fenced
}

const selftest = (): number => {
  const clean = classify('clean.api.md', [
    'export namespace Cell {',
    'export const HexString: Schema.brand<...>;',
    'export const strykerPlugins: PluginContribution<"Ignore">[];',
    'export const layerWith: (contents: Contents) => Layer.Layer<FileSystem>;',
    'export default _default;',
  ])
  const dirty = classify('dirty.api.md', [
    'export const surprise: (x: number) => number;',
    'export function loose(a: string): void ;',
    'export class Leaky {',
    '    save(): Effect.Effect<void>;',
    '}',
  ])
  const cleanOk = clean.findings.length === 0 && clean.exported === 5
  const dirtyFunction = dirty.findings.some((f) => f.symbol === 'loose')
  const dirtyConst = dirty.findings.some((f) => f.symbol === 'surprise')
  const dirtyEffect = dirty.findings.some((f) => f.symbol === 'Leaky' && f.reason.includes('Effect'))
  console.log(
    `selftest: clean=${cleanOk} free-function=${dirtyFunction} free-const=${dirtyConst} effect-member=${dirtyEffect}`,
  )
  return cleanOk && dirtyFunction && dirtyConst && dirtyEffect ? 0 : 1
}

if (Deno.args.includes('--selftest')) {
  Deno.exit(selftest())
}

const walk = async (dir: string): Promise<string[]> => {
  const found: string[] = []
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'temp') {
      found.push(...await walk(`${dir}/${entry.name}`))
    } else if (entry.isFile && entry.name.endsWith('.api.md')) {
      found.push(`${dir}/${entry.name}`)
    }
  }
  return found
}

const reports = await walk(Deno.cwd())
if (reports.length === 0) {
  console.log('::error::no committed api reports found — the classifier has nothing to certify')
  Deno.exit(1)
}

const allFindings: Finding[] = []
let exportedTotal = 0
for (const report of reports) {
  const result = classify(report, codeBlockLines(await Deno.readTextFile(report)))
  allFindings.push(...result.findings)
  exportedTotal += result.exported
}

console.log(`examined ${reports.length} api report(s), ${exportedTotal} exported symbol(s)`)

if (allFindings.length > 0) {
  for (const finding of allFindings) {
    console.log(`::error file=${finding.file}::${finding.symbol}: ${finding.reason}`)
  }
  Deno.exit(1)
}

console.log('every published symbol sits in one of the four shapes or a reasoned exception')
