import { Data } from 'effect'

import { SourceFileLocationFormatter } from '../analyzer/SourceFileLocationFormatter.js'

export const ExtractorMessageCategory = {
  Compiler: 'Compiler',
  TSDoc: 'TSDoc',
  Extractor: 'Extractor',
  Console: 'console',
} as const

export type ExtractorMessageCategory = (typeof ExtractorMessageCategory)[keyof typeof ExtractorMessageCategory]

export interface ExtractorMessageProperties {
  readonly exportName?: string
}

export type LogLevelValue = 'error' | 'warning' | 'none' | 'info' | 'verbose'

export interface ExtractorMessageProps {
  readonly category: ExtractorMessageCategory
  readonly messageId: string
  readonly text: string
  readonly sourceFilePath?: string | undefined
  readonly sourceFileLine?: number | undefined
  readonly sourceFileColumn?: number | undefined
  readonly properties?: ExtractorMessageProperties | undefined
  readonly logLevel?: LogLevelValue | undefined
}

export class ExtractorMessage extends Data.Class<ExtractorMessageProps> {
  declare public properties: ExtractorMessageProperties

  // The router assigns these after construction: the log level comes from the
  // reporting rules, and the source fields are refined by the source mapper.
  declare public logLevel: LogLevelValue
  declare public sourceFilePath: string | undefined
  declare public sourceFileLine: number | undefined
  declare public sourceFileColumn: number | undefined

  #handled: boolean

  constructor(props: ExtractorMessageProps) {
    super({
      ...props,
      properties: props.properties ?? {},
      logLevel: props.logLevel ?? 'none',
    })
    this.#handled = false
  }

  public get handled(): boolean {
    return this.#handled
  }

  public markHandled(): void {
    this.#handled = true
  }

  public formatMessageWithLocation(workingPackageFolderPath: string | undefined): string {
    let result = ''
    if (this.sourceFilePath !== undefined && this.sourceFilePath.length > 0) {
      result += SourceFileLocationFormatter.formatPath(this.sourceFilePath, {
        sourceFileLine: this.sourceFileLine,
        sourceFileColumn: this.sourceFileColumn,
        workingPackageFolderPath,
      })
      if (result.length > 0) {
        result += ' - '
      }
    }
    result += this.formatMessageWithoutLocation()
    return result
  }

  public formatMessageWithoutLocation(): string {
    return `(${this.messageId}) ${this.text}`
  }
}
