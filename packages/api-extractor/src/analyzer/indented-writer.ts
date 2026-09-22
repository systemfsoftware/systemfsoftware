import * as Pipeable from 'effect/Pipeable'

export class IndentedWriter extends Pipeable.Class {
  public defaultIndentPrefix: string = '    '
  public indentBlankLines: boolean = false
  public trimLeadingSpaces: boolean = false

  readonly #chunks: string[] = []
  #latestChunk: string | undefined = undefined
  #previousChunk: string | undefined = undefined
  #atStartOfLine: boolean = true

  readonly #indentStack: string[] = []
  #indentText: string = ''

  #previousLineIsBlank: boolean = true
  #currentLineIsBlank: boolean = true

  public constructor() {
    super()
  }

  public getText(): string {
    return this.#chunks.join('')
  }

  public override toString(): string {
    return this.getText()
  }

  public increaseIndent(indentPrefix?: string): void {
    this.#indentStack.push(indentPrefix ?? this.defaultIndentPrefix)
    this.#updateIndentText()
  }

  public decreaseIndent(): void {
    this.#indentStack.pop()
    this.#updateIndentText()
  }

  public indentScope(scope: () => void, indentPrefix?: string): void {
    this.increaseIndent(indentPrefix)
    scope()
    this.decreaseIndent()
  }

  public ensureNewLine(): void {
    const lastCharacter = this.peekLastCharacter()
    if (lastCharacter !== '\n' && lastCharacter !== '') {
      this.#writeNewLine()
    }
  }

  public ensureSkippedLine(): void {
    this.ensureNewLine()
    if (!this.#previousLineIsBlank) {
      this.#writeNewLine()
    }
  }

  public peekLastCharacter(): string {
    if (this.#latestChunk !== undefined) {
      return this.#latestChunk.substring(this.#latestChunk.length - 1)
    }
    return ''
  }

  public peekSecondLastCharacter(): string {
    if (this.#latestChunk !== undefined) {
      if (this.#latestChunk.length > 1) {
        return this.#latestChunk.substring(this.#latestChunk.length - 2, this.#latestChunk.length - 1)
      }
      if (this.#previousChunk !== undefined) {
        return this.#previousChunk.substring(this.#previousChunk.length - 1)
      }
    }
    return ''
  }

  public write(message: string): void {
    if (message.length === 0) {
      return
    }

    if (!/[\r\n]/.test(message)) {
      this.#writeLinePart(message)
      return
    }

    let first = true
    for (const linePart of message.split('\n')) {
      if (!first) {
        this.#writeNewLine()
      } else {
        first = false
      }
      if (linePart) {
        this.#writeLinePart(linePart.replace(/[\r]/g, ''))
      }
    }
  }

  public writeLine(message: string = ''): void {
    if (message.length > 0) {
      this.write(message)
    }
    this.#writeNewLine()
  }

  #writeLinePart(message: string): void {
    let trimmedMessage = message

    if (this.trimLeadingSpaces && this.#atStartOfLine) {
      trimmedMessage = message.replace(/^ +/, '')
    }

    if (trimmedMessage.length > 0) {
      if (this.#atStartOfLine && this.#indentText.length > 0) {
        this.#write(this.#indentText)
      }
      this.#write(trimmedMessage)
      if (this.#currentLineIsBlank) {
        if (/\S/.test(trimmedMessage)) {
          this.#currentLineIsBlank = false
        }
      }
      this.#atStartOfLine = false
    }
  }

  #writeNewLine(): void {
    if (this.indentBlankLines && this.#atStartOfLine && this.#indentText.length > 0) {
      this.#write(this.#indentText)
    }

    this.#previousLineIsBlank = this.#currentLineIsBlank
    this.#write('\n')
    this.#currentLineIsBlank = true
    this.#atStartOfLine = true
  }

  #write(s: string): void {
    this.#previousChunk = this.#latestChunk
    this.#latestChunk = s
    this.#chunks.push(s)
  }

  #updateIndentText(): void {
    this.#indentText = this.#indentStack.join('')
  }
}
