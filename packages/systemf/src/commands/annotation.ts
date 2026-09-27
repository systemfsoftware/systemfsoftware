import { Context } from 'effect'
import { Command } from 'effect/unstable/cli'
import type { ResultType } from '../contract/result.js'

export interface CommandSpec {
  readonly resultTypes: readonly ResultType[]
}

export class CommandSpecKey extends Context.Service<CommandSpecKey, CommandSpec>()(
  '@systemfsoftware/systemf/commands/annotation/CommandSpecKey',
) {}

export const withResultTypes = (spec: CommandSpec) =>
<Name extends string, Input, ContextInput, E, R>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
): Command.Command<Name, Input, ContextInput, E, R> => Command.annotate(command, CommandSpecKey, spec)
