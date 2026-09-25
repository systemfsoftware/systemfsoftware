#!/usr/bin/env -S deno run

import { join } from '@std/path'
import { parse } from 'just-bash'
import type { CommandNode, ScriptNode, SimpleCommandNode, StatementNode, WordNode } from 'just-bash'
import { isRecord, readStdin } from './payload.ts'
import { evaluateGuardChange, formatPolicyVerdict, parseGuardConfig, readEffectiveSettings } from './policy.ts'
import type { ConfigView, GuardChange, GuardSources, PolicyVerdict, Source } from './policy.ts'

type WordPart = WordNode['parts'][number]

export type CommandGuardSources = GuardSources

export interface CommandGuardReads {
  readonly workspaceYaml: () => string
  readonly npmrc: () => string
}

export interface CommandGuardInput {
  readonly payload: string
  readonly reads: CommandGuardReads
}

export interface CommandGuardResult {
  readonly exit: 0 | 2
  readonly stderr: string
}

interface WordText {
  readonly text: string
  readonly dynamic: boolean
}

interface ConfigWrite {
  readonly kind: 'set' | 'delete'
  readonly key: WordText
  readonly value: WordText
}

interface InvocationFacts {
  readonly subcommand: WordText | null
  readonly positionals: readonly WordText[]
  readonly configWrites: readonly ConfigWrite[]
  readonly flagWrites: readonly ConfigWrite[]
  readonly allowBuildValues: readonly WordText[]
  readonly allowBuildBare: boolean
  readonly retarget: boolean
  readonly fixRequested: boolean
  readonly helpRequested: boolean
}

const ALLOW: CommandGuardResult = { exit: 0, stderr: '' }
const EMPTY_WORD: WordText = { text: '', dynamic: false }
const DYNAMIC_WORD: WordText = { text: '', dynamic: true }
const ENV_PREFIX = /^pnpm_config_/i
const GLOB_PATTERN = /[*?[\]{}]/
const PNPM_WORD = /(^|[^A-Za-z0-9_.-])(pnpm|pnpx|pnx|pn)([^A-Za-z0-9_-]|$)/
const PNPM_FAMILY: Readonly<Record<string, true>> = { pnpm: true, pn: true, pnx: true, pnpx: true }
const HELP_FLAGS: Readonly<Record<string, true>> = { '--help': true, '-h': true, '--version': true, '-v': true }
const VALUE_FLAGS: Readonly<Record<string, true>> = {
  '-C': true,
  '--dir': true,
  '--location': true,
  '-F': true,
  '--filter': true,
  '--reporter': true,
}
const RETARGET_FLAGS: Readonly<Record<string, true>> = { '-C': true, '--dir': true }

const literalWord = (text: string): WordText => ({ text, dynamic: false })

const setWrite = (key: WordText, value: WordText): ConfigWrite => ({ kind: 'set', key, value })

const partText = (part: WordPart): WordText => {
  switch (part.type) {
    case 'Literal':
    case 'SingleQuoted':
    case 'Escaped':
      return literalWord(part.value)
    case 'DoubleQuoted': {
      let text = ''
      let dynamic = false
      for (const inner of part.parts) {
        const innerText = partText(inner)
        text += innerText.text
        dynamic = dynamic || innerText.dynamic
      }
      return { text, dynamic }
    }
    default:
      return { text: '', dynamic: true }
  }
}

const wordTextOf = (word: WordNode): WordText => {
  let text = ''
  let dynamic = false
  for (const part of word.parts) {
    const partResult = partText(part)
    text += partResult.text
    dynamic = dynamic || partResult.dynamic
  }
  return { text, dynamic }
}

const substitutionsIn = (word: WordNode): StatementNode[] => {
  const found: StatementNode[] = []
  const stack: WordPart[] = [...word.parts]
  while (stack.length > 0) {
    const part = stack.pop()!
    if (part.type === 'CommandSubstitution') {
      found.push(...part.body.statements)
    } else if (part.type === 'DoubleQuoted') {
      stack.push(...part.parts)
    }
  }
  return found
}

const visitCommand = (
  command: CommandNode,
  visit: (command: SimpleCommandNode) => void,
  pending: StatementNode[],
): void => {
  switch (command.type) {
    case 'SimpleCommand': {
      visit(command)
      const words = command.name === null ? [...command.args] : [command.name, ...command.args]
      for (const word of words) {
        pending.push(...substitutionsIn(word))
      }
      for (const assignment of command.assignments) {
        if (assignment.value !== null) {
          pending.push(...substitutionsIn(assignment.value))
        }
      }
      for (const redirection of command.redirections) {
        if (redirection.target.type === 'Word') {
          pending.push(...substitutionsIn(redirection.target))
        }
      }
      break
    }
    case 'FunctionDef':
      visitCommand(command.body, visit, pending)
      break
    case 'If':
      for (const clause of command.clauses) {
        pending.push(...clause.condition, ...clause.body)
      }
      if (command.elseBody !== null) {
        pending.push(...command.elseBody)
      }
      break
    case 'For':
      pending.push(...command.body)
      for (const word of command.words ?? []) {
        pending.push(...substitutionsIn(word))
      }
      break
    case 'CStyleFor':
      pending.push(...command.body)
      break
    case 'While':
    case 'Until':
      pending.push(...command.condition, ...command.body)
      break
    case 'Case':
      for (const item of command.items) {
        pending.push(...item.body)
      }
      break
    case 'Subshell':
    case 'Group':
      pending.push(...command.body)
      break
    default:
      break
  }
}

const simpleCommandsOf = (script: ScriptNode): SimpleCommandNode[] => {
  const found: SimpleCommandNode[] = []
  const pending: StatementNode[] = [...script.statements]
  while (pending.length > 0) {
    const statement = pending.pop()!
    for (const pipeline of statement.pipelines) {
      for (const command of pipeline.commands) {
        visitCommand(command, (simple) => found.push(simple), pending)
      }
    }
  }
  return found
}

const invocationArgsOf = (command: SimpleCommandNode): readonly WordText[] | null => {
  if (command.name === null) {
    return null
  }
  const program = wordTextOf(command.name)
  if (program.dynamic) {
    return null
  }
  const args = command.args.map(wordTextOf)
  if (PNPM_FAMILY[program.text] === true) {
    return args
  }
  const first = args[0]
  return program.text === 'corepack' && first !== undefined && !first.dynamic && PNPM_FAMILY[first.text] === true
    ? args.slice(1)
    : null
}

const SETTING_SOURCE_PREFIX = /^(workspace|npmrc)/

const guardedSettingIds = (): ReadonlySet<string> => {
  const parsed = parseGuardConfig({ workspaceYaml: '', npmrc: '' })
  return parsed.tag === 'ok'
    ? new Set(
      Object.keys(readEffectiveSettings(parsed.view)).map((field) =>
        field.replace(SETTING_SOURCE_PREFIX, '').toLowerCase()
      ),
    )
    : new Set()
}

const GUARDED_SETTING_IDS: ReadonlySet<string> = guardedSettingIds()

const keyProbeView = (key: string): ConfigView | null => {
  const quoted = `'${key.replace(/'/g, "''")}'`
  const parsed = parseGuardConfig({ workspaceYaml: `${quoted}: probe\n`, npmrc: `${key}=probe\n` })
  return parsed.tag === 'ok' ? parsed.view : null
}

const isGuardedKey = (key: string): boolean => {
  const view = keyProbeView(key)
  if (view === null) {
    return false
  }
  const posture = readEffectiveSettings(view)
  return (
    [...view.settings.values()].some((entry) => GUARDED_SETTING_IDS.has(entry.setting)) ||
    posture.workspaceScopeRegistries.value.size > 0 ||
    posture.npmrcScopeRegistries.value.size > 0 ||
    posture.npmrcAuth.value.size > 0
  )
}

const flagWithValueOf = (
  text: string,
  args: readonly WordText[],
  index: number,
): { readonly value: string | null; readonly consumed: number } | null => {
  const separate = (): { readonly value: string | null; readonly consumed: number } => {
    const next = args[index + 1]
    return { value: next === undefined || next.dynamic ? null : next.text, consumed: 1 }
  }
  if (VALUE_FLAGS[text] !== true) {
    for (const prefix of ['--location=', '--dir=', '--filter=', '--reporter=']) {
      if (text.startsWith(prefix)) {
        return { value: text.slice(prefix.length), consumed: 0 }
      }
    }
    return text.length > 2 && (text.startsWith('-C') || text.startsWith('-F'))
      ? { value: text.slice(2), consumed: 0 }
      : null
  }
  return separate()
}

const isRetargetFlag = (text: string): boolean =>
  RETARGET_FLAGS[text] === true || ((text.startsWith('-C') || text.startsWith('--dir=')) && text.length > 2)

const isLocationFlag = (text: string): boolean => text === '--location' || text.startsWith('--location=')

const configWritesOf = (positionals: readonly WordText[]): ConfigWrite[] => {
  const [subcommand, verb, key, value] = positionals
  if (subcommand?.text !== 'config' || verb === undefined || (verb.text !== 'set' && verb.text !== 'delete')) {
    return []
  }
  if (key === undefined) {
    return [setWrite({ text: '', dynamic: true }, EMPTY_WORD)]
  }
  return [{ kind: verb.text, key, value: value ?? (verb.text === 'set' ? { text: '', dynamic: true } : EMPTY_WORD) }]
}

const scanInvocation = (args: readonly WordText[]): InvocationFacts => {
  const positionals: WordText[] = []
  const flagWrites: ConfigWrite[] = []
  const allowBuildValues: WordText[] = []
  let allowBuildBare = false
  let retarget = false
  let fixRequested = false
  let helpRequested = false

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg.dynamic) {
      if (arg.text.startsWith('--config.')) {
        flagWrites.push(setWrite({ text: arg.text.slice('--config.'.length), dynamic: true }, EMPTY_WORD))
      } else if (arg.text.startsWith('--no-')) {
        flagWrites.push(setWrite({ text: arg.text.slice('--no-'.length), dynamic: true }, literalWord('false')))
      } else if (arg.text.startsWith('--allow-build')) {
        allowBuildValues.push(arg)
      } else {
        positionals.push(arg)
      }
      continue
    }
    const text = arg.text
    if (HELP_FLAGS[text] === true) {
      helpRequested = true
      continue
    }
    const inlineConfig = /^--config\.([^=]+)=(.*)$/s.exec(text)
    if (inlineConfig !== null) {
      flagWrites.push(setWrite(literalWord(inlineConfig[1]!), literalWord(inlineConfig[2]!)))
      continue
    }
    if (text.startsWith('--config.') && text.length > '--config.'.length) {
      const next = args[index + 1]
      if (next !== undefined && !next.dynamic && !next.text.startsWith('-')) {
        flagWrites.push(setWrite(literalWord(text.slice('--config.'.length)), next))
        index += 1
      } else {
        flagWrites.push(setWrite(literalWord(text.slice('--config.'.length)), DYNAMIC_WORD))
      }
      continue
    }
    const danger = /^--dangerously-allow-all-builds(?:=(.*))?$/s.exec(text)
    if (danger !== null) {
      flagWrites.push(setWrite(literalWord('dangerously-allow-all-builds'), literalWord(danger[1] ?? 'true')))
      continue
    }
    const negative = /^--no-(.+)$/s.exec(text)
    if (negative !== null) {
      flagWrites.push(setWrite(literalWord(negative[1]!), literalWord('false')))
      continue
    }
    const allowBuild = /^--allow-build(?:=(.*))?$/s.exec(text)
    if (allowBuild !== null) {
      const next = args[index + 1]
      if (allowBuild[1] !== undefined) {
        allowBuildValues.push(literalWord(allowBuild[1]))
      } else if (next === undefined || next.dynamic || next.text.startsWith('-')) {
        allowBuildBare = true
      } else {
        allowBuildValues.push(next)
        index += 1
      }
      continue
    }
    const valueFlag = flagWithValueOf(text, args, index)
    if (valueFlag !== null) {
      retarget = retarget || isRetargetFlag(text) || (isLocationFlag(text) && valueFlag.value === 'global')
      index += valueFlag.consumed
      continue
    }
    if (text === '--fix' || text.startsWith('--fix=') || text === '-f' || text === '-fix') {
      fixRequested = true
      continue
    }
    const equalsFlag = /^--([^=]+)=(.*)$/s.exec(text)
    if (equalsFlag !== null) {
      flagWrites.push(setWrite(literalWord(equalsFlag[1]!), literalWord(equalsFlag[2]!)))
      continue
    }
    if (text.length > 1 && text.startsWith('-')) {
      continue
    }
    positionals.push(arg)
  }

  return {
    subcommand: positionals[0] ?? null,
    positionals,
    configWrites: configWritesOf(positionals),
    flagWrites,
    allowBuildValues,
    allowBuildBare,
    retarget,
    fixRequested,
    helpRequested,
  }
}

const envKeyOf = (name: string, nameDynamic: boolean): WordText | null =>
  ENV_PREFIX.test(name) ? { text: name.slice('pnpm_config_'.length), dynamic: nameDynamic } : null

const assignmentWriteOf = (word: WordNode): ConfigWrite | null => {
  let name = ''
  let nameDynamic = false
  let valueText = ''
  let valueDynamic = false
  let inValue = false
  for (const part of word.parts) {
    const partResult = partText(part)
    if (inValue) {
      valueText += partResult.text
      valueDynamic = valueDynamic || partResult.dynamic
      continue
    }
    const separator = partResult.text.indexOf('=')
    if (separator === -1) {
      name += partResult.text
      nameDynamic = nameDynamic || partResult.dynamic
      continue
    }
    name += partResult.text.slice(0, separator)
    valueText += partResult.text.slice(separator + 1)
    valueDynamic = valueDynamic || partResult.dynamic
    inValue = true
  }
  if (!inValue) {
    return null
  }
  const key = envKeyOf(name, nameDynamic)
  return key === null ? null : setWrite(key, { text: valueText, dynamic: valueDynamic })
}

const ENV_WRAPPER_PROGRAMS: Readonly<Record<string, true>> = {
  env: true,
  command: true,
  nice: true,
  nohup: true,
  setsid: true,
  stdbuf: true,
  time: true,
  xargs: true,
}

const isEnvWrapperCommand = (command: SimpleCommandNode): boolean => {
  if (command.name === null) {
    return false
  }
  const program = wordTextOf(command.name)
  return !program.dynamic && ENV_WRAPPER_PROGRAMS[program.text] === true
}

const isExportCommand = (command: SimpleCommandNode): boolean => {
  if (command.name === null) {
    return false
  }
  const program = wordTextOf(command.name)
  return !program.dynamic && program.text === 'export'
}

const evaluateWrite = (sources: GuardSources, write: ConfigWrite): PolicyVerdict => {
  const changeFor = (source: Source): GuardChange =>
    write.kind === 'set'
      ? { kind: 'set', source, key: write.key.text, value: write.value.text }
      : { kind: 'delete', source, key: write.key.text }
  const workspaceVerdict = evaluateGuardChange(sources, changeFor('workspace'))
  return workspaceVerdict.tag === 'allow' ? evaluateGuardChange(sources, changeFor('npmrc')) : workspaceVerdict
}

const policyBlock = (verdict: PolicyVerdict): CommandGuardResult => ({
  exit: 2,
  stderr: `guard-pnpm-command: blocked pnpm invocation\n\n${formatPolicyVerdict(verdict)}`,
})

const retargetBlock = (key: string): CommandGuardResult => ({
  exit: 2,
  stderr: `guard-pnpm-command: blocked pnpm config write outside the project\n\n` +
    `This writes ${key} to pnpm config outside the project (-C/--dir, or --location global), which the agent never does.\n` +
    `Remediation: ask a human to run the command by hand.`,
})

const deleteBlock = (key: string): CommandGuardResult => ({
  exit: 2,
  stderr: `guard-pnpm-command: blocked pnpm config delete\n\n` +
    `Deleting ${key} removes a guarded setting from the pnpm config; the agent does not remove guarded settings.\n` +
    `Remediation: ask a human to make this change by hand.`,
})

const cannotVerifyBlock = (reason: string): CommandGuardResult => ({
  exit: 2,
  stderr: `guard-pnpm-command: blocked pnpm invocation (cannot verify)\n\n` +
    `${reason}\n` +
    `Remediation: ask a human, or re-express the change with a literal setting name and value.`,
})

const grantAllBlock = (reason: string): CommandGuardResult => ({
  exit: 2,
  stderr: `guard-pnpm-command: blocked pnpm build-script grant\n\n` +
    `${reason}\n` +
    `Remediation: ask a human to grant build scripts — run \`pnpm approve-builds <pkg>\` by hand, or edit pnpm-workspace.yaml.`,
})

const AUDIT_FIX_BLOCK: CommandGuardResult = {
  exit: 2,
  stderr: `guard-pnpm-command: blocked pnpm audit --fix\n\n` +
    `pnpm audit --fix rewrites the pnpm config through pnpm, minting release-age exclusions for the advisories it fixes.\n` +
    `Only a human mints exemptions.\n` +
    `Remediation: ask a human to run \`pnpm audit --fix\` when a CVE demands the exception.`,
}

const UNPARSEABLE_BLOCK: CommandGuardResult = {
  exit: 2,
  stderr: `guard-pnpm-command: blocked unparseable command naming pnpm\n\n` +
    `The command could not be parsed as a shell script and it names a pnpm-family program, so the guard cannot tell what it would run.\n` +
    `Remediation: re-express it in a form the guard can parse, or ask a human to run it.`,
}

const TOO_LARGE_BLOCK: CommandGuardResult = {
  exit: 2,
  stderr: `guard-pnpm-command: blocked oversize stdin payload\n\n` +
    `The payload exceeded the 1 MiB cap, so the guard could not read the command.\n` +
    `Remediation: ask a human to run the command.`,
}

const inspectWrite = (write: ConfigWrite, sources: () => GuardSources): CommandGuardResult | null => {
  if (write.key.dynamic) {
    return cannotVerifyBlock('the setting name is not a literal, so the guard cannot tell which setting it is.')
  }
  const guarded = isGuardedKey(write.key.text)
  if (write.kind === 'set' && write.value.dynamic) {
    return guarded
      ? cannotVerifyBlock(`the value of ${write.key.text} is not a literal, so its direction cannot be determined.`)
      : null
  }
  const verdict = evaluateWrite(sources(), write)
  if (verdict.tag !== 'allow') {
    return policyBlock(verdict)
  }
  return write.kind === 'delete' && guarded ? deleteBlock(write.key.text) : null
}

const inspectGrant = (packageName: string, sources: () => GuardSources): CommandGuardResult | null => {
  const verdict = evaluateGuardChange(sources(), { kind: 'grantBuild', packageName })
  return verdict.tag === 'allow' ? null : policyBlock(verdict)
}

const grantTargetsOf = (values: readonly WordText[]): WordText[] =>
  values.flatMap((value) =>
    value.dynamic
      ? [value]
      : value.text.split(',').map((name) => name.trim()).filter((name) => name !== '').map(literalWord)
  )

const noLiteralTarget = (targets: readonly WordText[]): WordText | undefined =>
  targets.find((target) => target.dynamic || GLOB_PATTERN.test(target.text))

const inspectGrants = (facts: InvocationFacts, sources: () => GuardSources): CommandGuardResult | null => {
  if (facts.subcommand?.text === 'approve-builds') {
    const packages = facts.positionals.slice(1)
    if (packages.length === 0) {
      return grantAllBlock(
        "approve-builds with no package names opens pnpm's approval prompt, which grants whatever it picks.",
      )
    }
    const wildcard = noLiteralTarget(packages)
    if (wildcard !== undefined) {
      return grantAllBlock(
        `approve-builds targets ${wildcard.text || 'a wildcard'}, which grants build scripts wholesale.`,
      )
    }
    for (const packageName of packages) {
      const result = inspectGrant(packageName.text, sources)
      if (result !== null) {
        return result
      }
    }
    return null
  }
  if (facts.allowBuildBare) {
    return grantAllBlock(
      'add --allow-build carries no package name, so pnpm is asked to grant build scripts wholesale.',
    )
  }
  if (facts.allowBuildValues.length === 0) {
    return null
  }
  const targets = grantTargetsOf(facts.allowBuildValues)
  if (targets.length === 0) {
    return grantAllBlock('add --allow-build carries an empty value, so the grant names no package.')
  }
  const wildcard = noLiteralTarget(targets)
  if (wildcard !== undefined) {
    return grantAllBlock(`add --allow-build=${wildcard.text || 'a wildcard'} grants build scripts wholesale.`)
  }
  for (const target of targets) {
    const result = inspectGrant(target.text, sources)
    if (result !== null) {
      return result
    }
  }
  return null
}

const inspectEnvironment = (command: SimpleCommandNode, sources: () => GuardSources): CommandGuardResult | null => {
  const writes: ConfigWrite[] = command.assignments.flatMap((assignment) => {
    const key = envKeyOf(assignment.name, false)
    return key === null
      ? []
      : [setWrite(key, assignment.value === null ? EMPTY_WORD : wordTextOf(assignment.value))]
  })
  if (isExportCommand(command)) {
    for (const arg of command.args) {
      const write = assignmentWriteOf(arg)
      if (write !== null) {
        writes.push(write)
      }
    }
  }
  if (isEnvWrapperCommand(command)) {
    for (const arg of command.args) {
      const write = assignmentWriteOf(arg)
      if (write !== null) {
        writes.push(write)
      }
    }
  }
  for (const write of writes) {
    const result = inspectWrite(write, sources)
    if (result !== null) {
      return result
    }
  }
  return null
}

const inspectCommand = (command: SimpleCommandNode, sources: () => GuardSources): CommandGuardResult | null => {
  const program = command.name === null ? null : wordTextOf(command.name)
  if (program !== null && program.dynamic && ENV_PREFIX.test(program.text)) {
    return cannotVerifyBlock('the pnpm_config_ environment variable name is not a literal.')
  }
  const environment = inspectEnvironment(command, sources)
  if (environment !== null) {
    return environment
  }
  const args = invocationArgsOf(command)
  if (args === null) {
    return null
  }
  const facts = scanInvocation(args)
  if (facts.helpRequested) {
    return null
  }
  if (facts.subcommand?.text === 'audit' && facts.fixRequested) {
    return AUDIT_FIX_BLOCK
  }
  const retargeted = [...facts.configWrites, ...facts.flagWrites]
    .find((write) => !write.key.dynamic && isGuardedKey(write.key.text))
  if (facts.retarget && retargeted !== undefined) {
    return retargetBlock(retargeted.key.text)
  }
  const grant = inspectGrants(facts, sources)
  if (grant !== null) {
    return grant
  }
  for (const write of [...facts.configWrites, ...facts.flagWrites]) {
    const result = inspectWrite(write, sources)
    if (result !== null) {
      return result
    }
  }
  return null
}

const decodeBashCommand = (raw: string): string | null => {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value['tool_name'] !== 'Bash') {
    return null
  }
  const toolInput = value['tool_input']
  if (!isRecord(toolInput)) {
    return null
  }
  const command = toolInput['command']
  return typeof command === 'string' && command.trim() !== '' ? command : null
}

export const runCommandGuard = (input: CommandGuardInput): CommandGuardResult => {
  const command = decodeBashCommand(input.payload)
  if (command === null) {
    return ALLOW
  }
  let script: ScriptNode
  try {
    script = parse(command)
  } catch {
    return PNPM_WORD.test(command) ? UNPARSEABLE_BLOCK : ALLOW
  }
  let posture: GuardSources | null = null
  const sources = (): GuardSources =>
    posture ??= { workspaceYaml: input.reads.workspaceYaml(), npmrc: input.reads.npmrc() }
  for (const simple of simpleCommandsOf(script)) {
    let result: CommandGuardResult | null
    try {
      result = inspectCommand(simple, sources)
    } catch {
      return cannotVerifyBlock('the project pnpm config could not be read to compare against.')
    }
    if (result !== null) {
      return result
    }
  }
  return ALLOW
}

const readSource = (path: string): string => {
  try {
    return Deno.readTextFileSync(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return ''
    }
    throw error
  }
}

const projectRootOf = (raw: string): string => {
  try {
    const value: unknown = JSON.parse(raw)
    const cwd = isRecord(value) ? value['cwd'] : undefined
    return typeof cwd === 'string' && cwd !== '' ? cwd : Deno.cwd()
  } catch {
    return Deno.cwd()
  }
}

if (import.meta.main) {
  const stdin = await readStdin()
  const result: CommandGuardResult = stdin.tag === 'too-large' ? TOO_LARGE_BLOCK : runCommandGuard({
    payload: stdin.content,
    reads: {
      workspaceYaml: () => readSource(join(projectRootOf(stdin.content), 'pnpm-workspace.yaml')),
      npmrc: () => readSource(join(projectRootOf(stdin.content), '.npmrc')),
    },
  })
  if (result.stderr !== '') {
    console.error(result.stderr)
  }
  Deno.exit(result.exit)
}
