import { HashMap, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { type MappingItem, SourceMapConsumer } from 'source-map'
import { dirname, resolve } from '../analyzer/path-helpers.js'
import { type SourceMap, SourceMapJsonFromString } from './source-map.schema.js'

export interface MessagePosition {
  readonly sourceFilePath: string
  readonly line: number
  readonly column: number
}

export interface SourceMapIndex {
  readonly mapTextByDtsPath: HashMap.HashMap<string, string>
  readonly originalTextByPath: HashMap.HashMap<string, string>
}

interface Point {
  readonly line: number
  readonly column: number
}

const decodeMap = (mapText: string): Option.Option<SourceMap> =>
  Result.match(Schema.decodeResult(SourceMapJsonFromString)(mapText), {
    onFailure: () => Option.none(),
    onSuccess: (decoded) => Option.some(decoded),
  })

export const sourcePathsOf = (mapText: string): ReadonlyArray<string> =>
  Option.match(decodeMap(mapText), {
    onNone: () => [],
    onSome: (decoded) => decoded.sources,
  })

const mappingItemsOf = (consumer: SourceMapConsumer): readonly MappingItem[] => {
  const MappingItems: MappingItem[] = []
  consumer.eachMapping(
    (mappingItem) => {
      MappingItems.push({
        ...mappingItem,
        generatedColumn: mappingItem.generatedColumn + 1,
        originalColumn: mappingItem.originalColumn + 1,
      })
    },
    undefined,
    SourceMapConsumer.GENERATED_ORDER,
  )
  return MappingItems
}

const pointOf = (item: MappingItem): Point => ({ line: item.generatedLine, column: item.generatedColumn })

const pointOrder: Order.Order<Point> = Order.combine(
  Order.mapInput(Order.Number, (point: Point) => point.line),
  Order.mapInput(Order.Number, (point: Point) => point.column),
)

const belowTarget = -1
const atTarget = 0
const aboveTarget = 1

const nearestMapping = (items: readonly MappingItem[], target: Point): Option.Option<MappingItem> => {
  const search = (start: number, end: number): number =>
    Match.value(start > end).pipe(
      Match.when(true, () => end),
      Match.orElse(() => {
        const middle = start + Math.floor((end - start) / 2)
        return Option.match(Arr.get(items, middle), {
          onNone: () => end,
          onSome: (item) =>
            Match.value(pointOrder(pointOf(item), target)).pipe(
              Match.when(belowTarget, () => search(middle + 1, end)),
              Match.when(atTarget, () => middle),
              Match.when(aboveTarget, () => search(start, middle - 1)),
              Match.exhaustive,
            ),
        })
      }),
    )
  return Arr.get(items, search(0, items.length - 1))
}

const maxColumnOf = (maxColumnForLine: readonly number[], line: number): number =>
  Option.getOrElse(Arr.get(maxColumnForLine, line), () => 0)

const maxColumnForLineOf = (text: string): readonly number[] =>
  Arr.prepend(Arr.map(text.split('\n'), (line) => line.length + 1), 0)

const lineInRange = (maxColumnForLine: readonly number[], position: Point): boolean =>
  position.line >= 1 && position.line < maxColumnForLine.length

const columnInRange = (maxColumnForLine: readonly number[], position: Point): boolean =>
  position.column >= 1 && position.column <= maxColumnOf(maxColumnForLine, position.line)

const inBounds = (maxColumnForLine: readonly number[], position: Point): boolean =>
  lineInRange(maxColumnForLine, position) && columnInRange(maxColumnForLine, position)

const translatedOf = (
  raw: MessagePosition,
  nearest: MappingItem,
  originalText: string,
  mappedFilePath: string,
): MessagePosition => {
  const maxColumnForLine = maxColumnForLineOf(originalText)
  const guessed = {
    line: nearest.originalLine + raw.line - nearest.generatedLine,
    column: nearest.originalColumn + raw.column - nearest.generatedColumn,
  }
  return Match.value(inBounds(maxColumnForLine, guessed)).pipe(
    Match.when(
      true,
      (): MessagePosition => ({ sourceFilePath: mappedFilePath, line: guessed.line, column: guessed.column }),
    ),
    Match.when(false, (): MessagePosition => ({
      sourceFilePath: mappedFilePath,
      line: nearest.originalLine,
      column: nearest.originalColumn,
    })),
    Match.exhaustive,
  )
}

const mappedTo = (raw: MessagePosition, nearest: MappingItem): string =>
  resolve(dirname(raw.sourceFilePath), nearest.source)

export const locate = dual<
  (raw: MessagePosition) => (index: SourceMapIndex) => Option.Option<MessagePosition>,
  (index: SourceMapIndex, raw: MessagePosition) => Option.Option<MessagePosition>
>(2, (index: SourceMapIndex, raw: MessagePosition): Option.Option<MessagePosition> =>
  Option.flatMap(
    HashMap.get(index.mapTextByDtsPath, raw.sourceFilePath),
    (mapText) =>
      Option.flatMap(decodeMap(mapText), (decoded) =>
        Option.flatMap(
          nearestMapping(
            mappingItemsOf(new SourceMapConsumer(decoded)),
            { line: raw.line, column: raw.column },
          ),
          (nearest) => {
            const mappedFilePath = mappedTo(raw, nearest)
            return Option.flatMap(HashMap.get(index.originalTextByPath, mappedFilePath), (originalText) =>
              Option.some(translatedOf(raw, nearest, originalText, mappedFilePath)))
          },
        )),
  ))
