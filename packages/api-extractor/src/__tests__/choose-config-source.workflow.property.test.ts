import { it } from '@systemfsoftware/vitest'
import { Equal } from 'effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import {
  chooseConfigSource,
  ConfigSource,
  type ConfigSourceDecision,
  ExplicitConfigSource,
  SearchedConfigSource,
} from '../choose-config-source.workflow.js'

const expectedSourceOf = (command: ConfigSource): ConfigSourceDecision =>
  Option.match(Option.fromNullishOr(command.explicitPath), {
    onNone: (): ConfigSourceDecision => SearchedConfigSource.make(),
    onSome: (path): ConfigSourceDecision => ExplicitConfigSource.make({ path }),
  })

it.prop(
  '∀c_Decision_≡ExplicitPathModel',
  { of: [ConfigSource], subject: chooseConfigSource },
  (subject, [command]) => {
    const outcome = subject(command)
    return Equal.equals(Result.getOrThrow(outcome), expectedSourceOf(command))
  },
)

it.prop(
  '∀c_ExplicitPath_≡CarriedPath',
  { of: [ConfigSource, Schema.String], subject: chooseConfigSource },
  (subject, [command, path]) => {
    const outcome = subject(ConfigSource.make({ startFolder: command.startFolder, explicitPath: path }))
    return Equal.equals(Result.getOrThrow(outcome), ExplicitConfigSource.make({ path }))
  },
)

it.prop(
  '∀c_AbsentPath_≡Searched',
  { of: [ConfigSource], subject: chooseConfigSource },
  (subject, [command]) => {
    const outcome = subject(ConfigSource.make({ startFolder: command.startFolder }))
    return Equal.equals(Result.getOrThrow(outcome), SearchedConfigSource.make())
  },
)
