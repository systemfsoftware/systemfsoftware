#!/usr/bin/env -S deno run --allow-read --allow-run=git

const PROPERTY_FILE = /(?:\.property\.test\.ts|\.prop\.test\.ts|\.tst\.ts)$/
const SCHEMA_FILE = /(?:\.schema\.ts|\.workflow\.ts)$/
const WEAKENING_LINE = /fc\.pre\(|S\.check\(|\.filter\(/
const DOMAIN_LINE = /S\.(?:check|filter|Union|Literals|brand|NonEmpty)/
const DECLARATION_MARKER = 'ORACLE-WEAKENING-DECLARED'

type Classified = {
  readonly propertyFiles: number
  readonly schemaFiles: number
  readonly weakened: readonly string[]
  readonly domainChanged: readonly string[]
}

const dec = new TextDecoder()

const git = async (args: string[]): Promise<string[]> => {
  const out = await new Deno.Command('git', { args, stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`git ${args[0]} failed: ${dec.decode(out.stderr).trim()}`)
  return dec.decode(out.stdout).split('\n').filter(Boolean)
}

export const classify = (diffLines: readonly string[]): Classified => {
  const weakened: string[] = []
  const domainChanged: string[] = []
  let propertyFiles = 0
  let schemaFiles = 0
  let currentFile = ''
  let inProperty = false
  let inSchema = false
  for (const line of diffLines) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6)
      inProperty = PROPERTY_FILE.test(currentFile)
      inSchema = SCHEMA_FILE.test(currentFile)
      if (inProperty) propertyFiles += 1
      if (inSchema) schemaFiles += 1
      continue
    }
    if (line.startsWith('--- ')) continue
    if (line.startsWith('-') && inProperty && WEAKENING_LINE.test(line)) {
      weakened.push(`${currentFile}: ${line.slice(1).trim()}`)
    }
    if ((line.startsWith('+') || line.startsWith('-')) && inSchema && DOMAIN_LINE.test(line)) {
      domainChanged.push(`${currentFile}: ${line.slice(1).trim()}`)
    }
  }
  return { propertyFiles, schemaFiles, weakened, domainChanged }
}

export const verdict = (
  classified: Classified,
  declared: boolean,
): { readonly fail: boolean; readonly reason: string } => {
  if (classified.weakened.length === 0 || classified.domainChanged.length === 0) {
    return { fail: false, reason: 'no weakening-adjacent change pair in this diff' }
  }
  if (declared) {
    return { fail: false, reason: 'weakening declared openly; adversarial review owns the pair' }
  }
  return {
    fail: true,
    reason:
      'a property generation boundary was softened in the same change as a schema domain edit; declare the weakening with ORACLE-WEAKENING-DECLARED in the commit message or restore the boundary',
  }
}

const selftest = (): number => {
  const pair = classify([
    '+++ b/pkg/src/__tests__/decide.property.test.ts',
    '-  S.check(...)',
    '+++ b/pkg/src/domain.schema.ts',
    '+  steps: S.NonEmptyArray(Step),',
  ])
  const halves = classify([
    '+++ b/pkg/src/__tests__/decide.property.test.ts',
    '-    fc.pre((job) => job.steps.length > 0)',
  ])
  const benign = classify([
    '+++ b/pkg/src/__tests__/decide.property.test.ts',
    '-    const old = 1',
    '+    const updated = 2',
  ])
  const pairFails = verdict(pair, false).fail
  const declaredPasses = !verdict(pair, true).fail
  const halvesPass = !verdict(halves, false).fail
  const benignPasses = !verdict(benign, false).fail
  console.log(
    `selftest: pair-fails=${pairFails} declared-passes=${declaredPasses} halves-pass=${halvesPass} benign-passes=${benignPasses}`,
  )
  return pairFails && declaredPasses && halvesPass && benignPasses ? 0 : 1
}

if (Deno.args.includes('--selftest')) {
  Deno.exit(selftest())
}

const base = Deno.args.find((arg: string): boolean => !arg.startsWith('-'))
if (base === undefined) {
  console.log('::notice::no base range given — oracle-weakening check inactive for this run')
  Deno.exit(0)
}

const diff = await git(['diff', `${base}...HEAD`, '--', '*.ts'])
const messages = await git(['log', `${base}..HEAD`, '--format=%B'])
const classified = classify(diff)
const declared = messages.some((message: string): boolean => message.includes(DECLARATION_MARKER))
const result = verdict(classified, declared)

console.log(
  `examined ${classified.propertyFiles} property file(s) and ${classified.schemaFiles} schema file(s); ` +
    `${classified.weakened.length} weakened boundary line(s), ${classified.domainChanged.length} domain line(s)`,
)

if (result.fail) {
  for (const line of classified.weakened) {
    console.log(`::error file=${line.split(':')[0]}::weakened: ${line}`)
  }
  for (const line of classified.domainChanged) {
    console.log(`::error file=${line.split(':')[0]}::domain: ${line}`)
  }
  console.log(`::error::${result.reason}`)
  Deno.exit(1)
}

console.log(result.reason)
