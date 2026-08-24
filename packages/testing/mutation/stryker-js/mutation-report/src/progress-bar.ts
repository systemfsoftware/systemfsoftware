export type ProgressBarState = {
  readonly format: string
  readonly total: number
  readonly curr: number
  readonly width: number
  readonly complete: string
  readonly incomplete: string
}

export const makeProgressBarState = (
  format: string,
  options: {
    readonly complete: string
    readonly incomplete: string
    readonly total: number
    readonly width: number
  },
): ProgressBarState => ({
  format,
  total: options.total,
  curr: 0,
  width: options.width,
  complete: options.complete,
  incomplete: options.incomplete,
})

export const tickProgressBar = (
  state: ProgressBarState,
  ticks: number,
): ProgressBarState => ({
  ...state,
  curr: state.curr + ticks,
})

export const renderProgressBar = (
  state: ProgressBarState,
  data: Readonly<Record<string, string | number>>,
): string =>
  formatBar(state.format, state.curr, state.total, data, {
    width: state.width,
    complete: state.complete,
    incomplete: state.incomplete,
  })

export const isComplete = (state: ProgressBarState): boolean => state.curr >= state.total

function formatBar(
  format: string,
  curr: number,
  total: number,
  data: Readonly<Record<string, string | number>>,
  options: { readonly width: number; readonly complete: string; readonly incomplete: string },
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
