/**
 * Claude Code hands `UserPromptSubmit` stdout to the model in a separate
 * `additionalContext` field. OMP's `InputEventResult` has none, so this bridge
 * fakes it by prefixing the prompt text — and the host parses slash, bash,
 * python and yield-queue prompts off their opening characters before a model
 * is involved. A prefix demotes a command to prose: `/compact` plus a hook
 * note becomes `note\n\n/compact`, which no longer opens with `/`.
 *
 * The sigils mirror the host's dispatch in `input-controller.ts` (`/` slash
 * and skill, `!` bash, `$` python, `->`/`=>` yield queue) and `queue-input.ts`.
 * The sentinel space appended before matching lets bare `$` and `$$` match as
 * prefixes without also catching `$HOME` or `${expr}`, which the host reads as
 * prose.
 *
 * Over-classifying is safe, under-classifying is not: a prompt wrongly called
 * host-bound takes its context one turn late, while one wrongly called
 * model-bound loses the command outright. Widen the list on doubt.
 */
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

const HOST_COMMAND_PREFIXES: ReadonlyArray<string> = [
  '/',
  '!',
  '->',
  '=>',
  '$ ',
  '$\t',
  '$\n',
  '$\r',
  '$$ ',
  '$$\t',
  '$$\n',
  '$$\r',
]

const PromptDestinationTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-claude-compat/PromptDestination',
)

export class Model extends S.TaggedClass<Model>()('Model', {}) {
  readonly [PromptDestinationTypeId] = PromptDestinationTypeId
}

export class Host extends S.TaggedClass<Host>()('Host', {}) {
  readonly [PromptDestinationTypeId] = PromptDestinationTypeId
}

const PromptDestination = S.Union(Model, Host)
export type PromptDestination = S.Schema.Type<typeof PromptDestination>

const ClassifyPromptCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-claude-compat/ClassifyPromptCommand',
)
export class ClassifyPromptCommand extends S.TaggedClass<ClassifyPromptCommand>()('ClassifyPromptCommand', {
  text: S.String,
}) {
  readonly [ClassifyPromptCommandTypeId] = ClassifyPromptCommandTypeId
}

const opensWithSigil = (text: string): boolean =>
  HOST_COMMAND_PREFIXES.some((prefix) => `${text.trimStart()} `.startsWith(prefix))

export const classifyPromptDestination = (cmd: ClassifyPromptCommand): PromptDestination =>
  Match.value(cmd.text).pipe(
    Match.when(opensWithSigil, () => new Host({})),
    Match.orElse(() => new Model({})),
  )
