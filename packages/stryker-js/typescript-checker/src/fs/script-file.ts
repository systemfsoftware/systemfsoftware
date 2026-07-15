import type { Mutant, Position } from '@stryker-mutator/api/core'

export class ScriptFile {
  private readonly originalContent: string

  constructor(
    public content: string,
    public fileName: string,
    public modifiedTime = new Date(),
  ) {
    this.originalContent = content
  }

  public write(content: string): void {
    this.content = content
    this.touch()
  }

  public mutate(mutant: Pick<Mutant, 'location' | 'replacement'>): void {
    const start = this.getOffset(mutant.location.start)
    const end = this.getOffset(mutant.location.end)
    this.content = `${this.originalContent.slice(0, start)}${mutant.replacement}${this.originalContent.slice(end)}`
    this.touch()
  }

  private getOffset(pos: Position): number {
    const lines = this.originalContent.split('\n')
    let offset = 0
    for (let i = 0; i < pos.line && i < lines.length; i++) {
      offset += lines[i]!.length + 1 // +1 for the newline character
    }
    offset += pos.column
    return offset
  }

  public resetMutant(): void {
    this.content = this.originalContent
    this.touch()
  }

  private touch(): void {
    this.modifiedTime = new Date()
  }
}
