import { Blueprint } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

type Top<A = unknown> = A

export const TypeId = Symbol.for('~systemfsoftware/effect-cell-types/tests/Question')
export type TypeId = typeof TypeId

export interface QuestionSpec {
  readonly id: string
  readonly labels: ReadonlyArray<string>
  readonly answer: (input: never) => string
}

export interface QuestionIndex {
  readonly Input: Top
  readonly Label: string
  readonly Scale: 'labels' | 'numbers'
}

export interface Check<Input> {
  readonly id: string
  readonly holds: (input: Input) => boolean
}

export class Unsure extends Data.TaggedError('Unsure')<{ readonly question: string }> {}

type InputOf<X> = X extends QuestionIndex ? X['Input'] : never
type LabelOf<X> = X extends QuestionIndex ? X['Label'] : never
type Fallback<A> = A extends readonly [Top, { readonly onUnsure: () => infer R }] ? readonly [R] : readonly []

interface Is extends Blueprint.Operation {
  readonly params: readonly [label: LabelOf<this['Index']>]
  readonly lastFirst: string
  readonly lastRest: readonly []
  readonly out: Check<InputOf<this['Index']>>
}

interface Above extends Blueprint.Operation {
  readonly params: this['Index'] extends { readonly Scale: 'numbers' } ? readonly [threshold: number] : never
  readonly lastFirst: number
  readonly lastRest: readonly []
  readonly out: Check<InputOf<this['Index']>>
}

interface Ask extends Blueprint.Operation {
  readonly params:
    | readonly [input: InputOf<this['Index']>]
    | readonly [input: InputOf<this['Index']>, options: { readonly onUnsure: () => Top }]
  readonly lastRest: readonly [] | readonly [options: { readonly onUnsure: () => Top }]
  readonly out: Fallback<this['Args']> extends readonly [infer R] ? Effect.Effect<LabelOf<this['Index']> | R>
    : Effect.Effect<LabelOf<this['Index']>, Unsure>
}

interface Labels extends Blueprint.Target {
  readonly target: ReadonlyArray<LabelOf<this['Index']>>
}

export interface QuestionOps {
  readonly is: Is
  readonly above: Above
  readonly ask: Ask
  readonly labels: Labels
}

export type Question<Input, Label extends string, Scale extends 'labels' | 'numbers' = 'labels'> = Blueprint.Blueprint<
  TypeId,
  QuestionSpec,
  QuestionOps,
  { readonly Input: Input; readonly Label: Label; readonly Scale: Scale }
>

type AnyQuestion = Question<never, string, 'labels' | 'numbers'>

const answerOf = (self: AnyQuestion, input: never): string => self.spec.answer(input)

const known = (self: AnyQuestion, input: never): Option.Option<string> =>
  Option.liftPredicate(answerOf(self, input), (label) => Arr.contains(self.spec.labels, label))

const Questions = Blueprint.make<QuestionSpec, QuestionIndex>()(TypeId).operations<QuestionOps>()({
  operations: {
    is: (self: AnyQuestion, label: string): Check<never> => ({
      id: `${self.spec.id} is ${label}`,
      holds: (input) => answerOf(self, input) === label,
    }),
    above: (self: AnyQuestion, threshold: number): Check<never> => ({
      id: `${self.spec.id} above ${threshold}`,
      holds: (input) => Number(answerOf(self, input)) > threshold,
    }),
    ask: {
      isDataFirst: (args) => Questions.is(args[0]),
      run: (self: AnyQuestion, input: never, options?: { readonly onUnsure: () => Top }) =>
        Option.match(known(self, input), {
          onNone: () =>
            Option.match(Option.fromNullishOr(options), {
              onNone: () => Effect.fail(new Unsure({ question: self.spec.id })),
              onSome: ({ onUnsure }) => Effect.sync(onUnsure),
            }),
          onSome: Effect.succeed,
        }),
    },
  },
  targets: { labels: (self: AnyQuestion) => self.spec.labels },
})

export const isQuestion = Questions.is

export const labels = <Input>() =>
<const Label extends string>(
  id: string,
  names: ReadonlyArray<Label>,
  answer: (input: Input) => Label,
): Question<Input, Label> => Questions.of({ id, labels: names, answer })

export const numbers =
  <Input>() => (id: string, answer: (input: Input) => number): Question<Input, `${number}`, 'numbers'> =>
    Questions.of({ id, labels: [], answer: (input: Input) => String(answer(input)) })

export const is = Questions.operations.is

export const above = Questions.operations.above

export const ask = Questions.operations.ask
