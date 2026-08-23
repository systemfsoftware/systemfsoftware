function formatBar(
  format: string,
  curr: number,
  total: number,
  data: Record<string, string | number>,
  options: { width: number; complete: string; incomplete: string },
): string {
  const ratio = total === 0 ? 0 : Math.min(curr / total, 1)
  const filled = Math.floor(ratio * options.width)
  const bar = options.complete.repeat(filled) + options.incomplete.repeat(options.width - filled)
  const percent = `${Math.floor(ratio * 100).toString().padStart(3, ' ')}%`
  let out = format
  out = out.replace(':bar', bar)
  out = out.replace(':percent', percent)
  for (const [k, v] of Object.entries(data)) {
    out = out.replaceAll(`:${k}`, String(v))
  }
  return out
}

export class ProgressBar {
  public total: number
  private curr = 0
  private readonly stream: NodeJS.WritableStream
  private readonly format: string
  private readonly width: number
  private readonly complete: string
  private readonly incomplete: string

  constructor(
    format: string,
    options: { complete: string; incomplete: string; stream: NodeJS.WritableStream; total: number; width: number },
  ) {
    this.format = format
    this.total = options.total
    this.width = options.width
    this.complete = options.complete
    this.incomplete = options.incomplete
    this.stream = options.stream
  }

  public tick(ticks: number, data: Record<string, string | number>): void {
    this.curr += ticks
    this.render(data)
  }

  public render(data: Record<string, string | number>): void {
    const line = formatBar(this.format, this.curr, this.total, data, {
      width: this.width,
      complete: this.complete,
      incomplete: this.incomplete,
    })
    this.stream.write(`\r${line}`)
    if (this.curr >= this.total) {
      this.stream.write('\n')
    }
  }
}

export const progressBarWrapper = { ProgressBar }
