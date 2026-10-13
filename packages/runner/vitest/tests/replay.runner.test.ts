import { it } from '@systemfsoftware/vitest'
import { ReplayFromText, replayOfText } from '@systemfsoftware/vitest/failure'
import { Option, Schema } from 'effect'

interface ReadReplay {
  readonly seed: number | undefined
  readonly path: ReadonlyArray<number> | undefined
}

const readReplay = (text: string): ReadReplay =>
  Option.match(Schema.decodeOption(ReplayFromText)(text), {
    onNone: (): ReadReplay => ({ seed: undefined, path: undefined }),
    onSome: (replay): ReadReplay => ({ seed: replay.seed, path: replay.path }),
  })

it('Should_ReadTheNamedSeedAndDecisions_When_TheTextNamesThem', function*({ expect }) {
  yield* expect(readReplay('seed=7;path=1,2,3')).toEqual({ seed: 7, path: [1, 2, 3] })
})

it('Should_ReadAnEmptyPath_When_TheTextNamesNoDecision', function*({ expect }) {
  yield* expect(readReplay('seed=1;path=')).toEqual({ seed: 1, path: [] })
})

it('Should_RefuseTheText_When_ItNamesNoSeedAndPath', function*({ expect }) {
  yield* expect(
    ['seed=-3;path=', 'seed=;path=1', 'foo'].map((text) => Option.isNone(Schema.decodeOption(ReplayFromText)(text))),
  ).toEqual([true, true, true])
})

it('Should_ThrowNamingTheText_When_TheTextNamesNoReplay', function*({ expect }) {
  yield* expect(() => replayOfText('foo')).toThrow(/: foo$/)
})
