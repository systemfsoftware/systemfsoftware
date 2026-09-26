import { it } from '@systemfsoftware/vitest'
import { Equal, Match, Schema } from 'effect'
import * as Result from 'effect/Result'

import { type ConfigChainDecision, ConfigChainStep, resolveExtendsChain } from '../resolve-extends-chain.workflow.js'

const stepOn = (command: ConfigChainStep, visited: ReadonlyArray<string>, content: string): ConfigChainStep =>
  ConfigChainStep.make({ filePath: command.filePath, fromFolder: command.fromFolder, visited, content })

const stepWithoutContent = (command: ConfigChainStep): ConfigChainStep =>
  ConfigChainStep.make({ filePath: command.filePath, fromFolder: command.fromFolder, visited: [] })

const isCircular = (command: ConfigChainStep, decision: ConfigChainDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('CircularExtends', (circular) =>
      command.visited.includes(command.filePath) &&
      Equal.equals([...circular.chain], [...command.visited, command.filePath])),
    Match.tag('FollowExtends', () => false),
    Match.tag('ChainComplete', () => false),
    Match.tag('ChainMissing', () => false),
    Match.tag('ChainMalformed', () => false),
    Match.exhaustive,
  )

const isMissing = (command: ConfigChainStep, decision: ConfigChainDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('ChainMissing', (missing) =>
      missing.filePath === command.filePath && missing.fromFolder === command.fromFolder),
    Match.tag('FollowExtends', () =>
      false),
    Match.tag('ChainComplete', () => false),
    Match.tag('CircularExtends', () => false),
    Match.tag('ChainMalformed', () => false),
    Match.exhaustive,
  )

const follows = (command: ConfigChainStep, specifier: string, decision: ConfigChainDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('FollowExtends', (follow) =>
      follow.specifier === specifier &&
      follow.fromFolder === command.fromFolder &&
      Equal.equals(follow.record, {})),
    Match.tag('ChainComplete', () => false),
    Match.tag('CircularExtends', () => false),
    Match.tag('ChainMissing', () => false),
    Match.tag('ChainMalformed', () => false),
    Match.exhaustive,
  )

const completes = (command: ConfigChainStep, decision: ConfigChainDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('ChainComplete', (complete) => Equal.equals(complete.record, {})),
    Match.tag('FollowExtends', () => false),
    Match.tag('CircularExtends', () => false),
    Match.tag('ChainMissing', () => false),
    Match.tag('ChainMalformed', () => false),
    Match.exhaustive,
  )

const isMalformed = (command: ConfigChainStep, decision: ConfigChainDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('ChainMalformed', (malformed) =>
      malformed.filePath === command.filePath && typeof malformed.cause === 'string'),
    Match.tag('FollowExtends', () =>
      false),
    Match.tag('ChainComplete', () => false),
    Match.tag('CircularExtends', () => false),
    Match.tag('ChainMissing', () => false),
    Match.exhaustive,
  )

it.prop(
  '∀c_RevisitedFile_≡CircularBeforeReading',
  { of: [ConfigChainStep, Schema.Array(Schema.String)], subject: resolveExtendsChain },
  (subject, [command, above]) => {
    const revisited = stepOn(command, [command.filePath, ...above], JSON.stringify({}))
    return isCircular(revisited, subject(revisited).pipe(Result.merge))
  },
)

it.prop(
  '∀c_AbsentFile_≡Missing',
  { of: [ConfigChainStep], subject: resolveExtendsChain },
  (subject, [command]) => isMissing(command, subject(stepWithoutContent(command)).pipe(Result.merge)),
)

it.prop(
  '∀c_DeclaredExtends_≡FollowExtendsStripped',
  { of: [ConfigChainStep, Schema.String], subject: resolveExtendsChain },
  (subject, [command, text]) => {
    const specifier = `./${text}`
    return follows(
      command,
      specifier,
      subject(stepOn(command, [], JSON.stringify({ extends: specifier }))).pipe(Result.merge),
    )
  },
)

it.prop(
  '∀c_UndeclaredExtends_≡ChainComplete',
  { of: [ConfigChainStep], subject: resolveExtendsChain },
  (subject, [command]) => completes(command, subject(stepOn(command, [], JSON.stringify({}))).pipe(Result.merge)),
)

it.prop(
  '∀c_UnparsableText_≡ChainMalformed',
  { of: [ConfigChainStep, Schema.String], subject: resolveExtendsChain },
  (subject, [command, text]) =>
    isMalformed(command, subject(stepOn(command, [], `not json${text}`)).pipe(Result.merge)),
)
