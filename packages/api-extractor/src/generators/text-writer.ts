import { Chunk } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

/*
 * An immutable replacement for the mutable `IndentedWriter`: every operation returns a new writer, and the
 * fragment sequence is kept verbatim because rendering peeks at the last two fragments — fragment boundaries
 * are part of the output contract, not an implementation detail.
 */
export interface TextWriter {
  readonly chunks: Chunk.Chunk<string>
  readonly latestChunk: Option.Option<string>
  readonly previousChunk: Option.Option<string>
  readonly atStartOfLine: boolean
  readonly indentStack: ReadonlyArray<string>
  readonly previousLineIsBlank: boolean
  readonly currentLineIsBlank: boolean
  readonly defaultIndentPrefix: string
  readonly indentBlankLines: boolean
  readonly trimLeadingSpaces: boolean
}

export interface TextWriterOptions {
  readonly defaultIndentPrefix?: string | undefined
  readonly indentBlankLines?: boolean | undefined
  readonly trimLeadingSpaces?: boolean | undefined
}

export const make = (options: TextWriterOptions = {}): TextWriter => ({
  chunks: Chunk.empty(),
  latestChunk: Option.none(),
  previousChunk: Option.none(),
  atStartOfLine: true,
  indentStack: [],
  previousLineIsBlank: true,
  currentLineIsBlank: true,
  defaultIndentPrefix: Option.getOrElse(Option.fromNullishOr(options.defaultIndentPrefix), () => '    '),
  indentBlankLines: Option.getOrElse(Option.fromNullishOr(options.indentBlankLines), () => false),
  trimLeadingSpaces: Option.getOrElse(Option.fromNullishOr(options.trimLeadingSpaces), () => false),
})

export const getText = (writer: TextWriter): string => Arr.join(Chunk.toReadonlyArray(writer.chunks), '')

const pushed = (writer: TextWriter, chunk: string): TextWriter => ({
  ...writer,
  chunks: Chunk.append(writer.chunks, chunk),
  latestChunk: Option.some(chunk),
  previousChunk: writer.latestChunk,
})

const indentTextOf = (writer: TextWriter): string => Arr.join(writer.indentStack, '')

const pendingIndent = (writer: TextWriter): Option.Option<string> =>
  Option.some(indentTextOf(writer)).pipe(
    Option.filter(() => writer.atStartOfLine),
    Option.filter(() => indentTextOf(writer).length > 0),
  )

const atLineStart = (writer: TextWriter): TextWriter =>
  Option.match(pendingIndent(writer), {
    onNone: () => writer,
    onSome: (indentText) => pushed(writer, indentText),
  })

const hasVisibleContent = (content: string): boolean => /\S/.test(content)

const appendContent = (writer: TextWriter, content: string): TextWriter => {
  const withIndent = atLineStart(writer)
  return {
    ...pushed(withIndent, content),
    atStartOfLine: false,
    currentLineIsBlank: withIndent.currentLineIsBlank && !hasVisibleContent(content),
  }
}

const writeNewLine = (writer: TextWriter): TextWriter => {
  const withIndent = Option.match(Option.filter(pendingIndent(writer), () => writer.indentBlankLines), {
    onNone: () => writer,
    onSome: (indentText) => pushed(writer, indentText),
  })
  return {
    ...pushed(withIndent, '\n'),
    previousLineIsBlank: withIndent.currentLineIsBlank,
    currentLineIsBlank: true,
    atStartOfLine: true,
  }
}

const writeLinePart = (writer: TextWriter, message: string): TextWriter => {
  const trimmedMessage = Match.value(writer.trimLeadingSpaces && writer.atStartOfLine).pipe(
    Match.when(true, () => message.replace(/^ +/, '')),
    Match.orElse(() => message),
  )

  return Match.value(trimmedMessage.length > 0).pipe(
    Match.when(true, () => appendContent(writer, trimmedMessage)),
    Match.orElse(() => writer),
  )
}

const writeLines = (writer: TextWriter, message: string): TextWriter =>
  Arr.reduce(Arr.fromIterable(message.split('\n')), writer, (accumulator, linePart, index) => {
    const afterBreak = Match.value(index === 0).pipe(
      Match.when(true, () => accumulator),
      Match.orElse(() => writeNewLine(accumulator)),
    )
    return writeLinePart(afterBreak, linePart.replace(/[\r]/g, ''))
  })

export const write = dual<
  (message: string) => (writer: TextWriter) => TextWriter,
  (writer: TextWriter, message: string) => TextWriter
>(2, (writer: TextWriter, message: string): TextWriter =>
  Match.value(message.length === 0).pipe(
    Match.when(true, () => writer),
    Match.orElse(() =>
      Match.value(/[\r\n]/.test(message)).pipe(
        Match.when(false, () => writeLinePart(writer, message)),
        Match.orElse(() => writeLines(writer, message)),
      )
    ),
  ))

export const writeLine = dual<
  (message?: string) => (writer: TextWriter) => TextWriter,
  (writer: TextWriter, message?: string) => TextWriter
>((args) => typeof args[0] !== 'string', (writer, message = ''): TextWriter => writeNewLine(write(writer, message)))

export const increaseIndent = dual<
  (indentPrefix?: string) => (writer: TextWriter) => TextWriter,
  (writer: TextWriter, indentPrefix?: string) => TextWriter
>((args) => typeof args[0] !== 'string', (writer, indentPrefix): TextWriter => ({
  ...writer,
  indentStack: Arr.append(writer.indentStack, indentPrefix ?? writer.defaultIndentPrefix),
}))

export const decreaseIndent = (writer: TextWriter): TextWriter => ({
  ...writer,
  indentStack: Arr.dropRight(writer.indentStack, 1),
})

export const ensureNewLine = (writer: TextWriter): TextWriter => {
  const lastCharacter = peekLastCharacter(writer)
  return Match.value(lastCharacter === '\n' || lastCharacter === '').pipe(
    Match.when(true, () => writer),
    Match.orElse(() => writeNewLine(writer)),
  )
}

export const ensureSkippedLine = (writer: TextWriter): TextWriter => {
  const afterNewLine = ensureNewLine(writer)
  return Match.value(afterNewLine.previousLineIsBlank).pipe(
    Match.when(true, () => afterNewLine),
    Match.orElse(() => writeNewLine(afterNewLine)),
  )
}

export const peekLastCharacter = (writer: TextWriter): string =>
  Option.match(writer.latestChunk, {
    onNone: () => '',
    onSome: (latest) => latest.substring(latest.length - 1),
  })

export const peekSecondLastCharacter = (writer: TextWriter): string =>
  Option.match(writer.latestChunk, {
    onNone: () => '',
    onSome: (latest) =>
      Match.value(latest.length > 1).pipe(
        Match.when(true, () => latest.substring(latest.length - 2, latest.length - 1)),
        Match.orElse(() =>
          Option.match(writer.previousChunk, {
            onNone: () => '',
            onSome: (previous) => previous.substring(previous.length - 1),
          })
        ),
      ),
  })
