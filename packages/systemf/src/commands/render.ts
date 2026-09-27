import type {
  CheckData,
  Coverage,
  Finding,
  ManifestArgument,
  ManifestCommand,
  ManifestData,
  ManifestExample,
  ManifestFlag,
  UnitListData,
  UnitShowData,
} from '../contract/result.js'

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

const declarationsOf = (finding: Finding): string =>
  finding.declarations.length === 0 ? '' : `  (${finding.declarations.join(', ')})`

const showHint = (finding: Finding): readonly string[] =>
  finding.rule === 'stop-coverage' ? [`  → systemf unit show ${finding.file}`] : []

const findingLines = (finding: Finding): readonly string[] => [
  `✗ ${finding.rule}  ${finding.file}${declarationsOf(finding)}`,
  `  ${finding.message}`,
  `  fix: ${finding.fix}`,
  ...showHint(finding),
]

const checkSummary = (data: CheckData): string =>
  data.findings.length === 0
    ? `systemf check: ${plural(data.summary.packages, 'package')}, ${
      plural(data.summary.units, 'unit')
    }, every unit reached`
    : `${plural(data.summary.findings, 'finding')} · ${plural(data.summary.units, 'unit')} · exit 1`

export const renderCheck = (data: CheckData): readonly string[] => [
  ...data.findings.flatMap(findingLines),
  checkSummary(data),
]

const coverageMark = (coverage: Coverage): string => (coverage === 'none' ? '✗' : '✓')

export const renderUnitList = (data: UnitListData): readonly string[] => [
  ...data.units.map(
    (row) =>
      `${coverageMark(row.coverage)} ${row.kind}  ${row.module}  (${row.declarations.join(', ')})  ${row.coverage}`,
  ),
  plural(data.units.length, 'unit'),
]

const fixLine = (fix: string | undefined): string => `fix: ${fix ?? ''}`

const reachLine = (reach: UnitShowData['reaches'][number]): string =>
  `reached ${reach.mode} from ${reach.file}:${reach.line} via \`${reach.via}\``

const reachLines = (data: UnitShowData): readonly string[] =>
  data.reaches.length === 0
    ? [`no Conformance.stopped check reaches this unit`, fixLine(data.fix)]
    : data.reaches.map(reachLine)

export const renderUnitShow = (data: UnitShowData): readonly string[] => [
  `${data.package}: ${data.kind}  ${data.module}  (${data.declarations.join(', ')})`,
  ...reachLines(data),
]

const globalLine = (flag: ManifestFlag): string => `  --${flag.name} ${flag.type}${requiredMark(flag.required)}`

const requiredMark = (required: boolean): string => (required ? ' required' : '')

const variadicMark = (variadic: boolean): string => (variadic ? '...' : '')

const descriptionMark = (description: string | undefined): string =>
  description === undefined ? '' : ` — ${description}`

const flagLine = (flag: ManifestFlag): string =>
  `  --${flag.name} ${flag.type}${requiredMark(flag.required)}${descriptionMark(flag.description)}`

const argumentLine = (argument: ManifestArgument): string =>
  `  <${argument.name}> ${argument.type}${variadicMark(argument.variadic)}${requiredMark(argument.required)}${
    descriptionMark(argument.description)
  }`

const exampleLine = (example: ManifestExample): string => `  ${example.command}${descriptionMark(example.description)}`

const commandLines = (command: ManifestCommand): readonly string[] => [
  `${command.path.join(' ')}  [${command.resultTypes.join(', ') || 'no result types'}]`,
  ...command.flags.map(flagLine),
  ...command.arguments.map(argumentLine),
  ...command.examples.map(exampleLine),
]

export const renderManifest = (data: ManifestData): readonly string[] => [
  `${data.name} ${data.version}  ${data.description}`,
  `global flags: ${data.globalFlags.map(globalLine).join(' | ')}`,
  ...data.commands.flatMap(commandLines),
  `exit codes: ${data.exitCodes.map((entry) => `${entry.code} ${entry.meaning}`).join(' | ')}`,
  `error codes: ${data.errorCodes.map((entry) => entry.code).join(' ')}`,
]
