export interface HooksForEventResult {
  readonly block?: boolean
  readonly reason?: string
  readonly warning?: string
  readonly updatedInput?: Record<string, unknown>
}

export type FeedbackOnlyResult = Omit<HooksForEventResult, 'block' | 'reason'>

export const blockAsFeedback = (result: HooksForEventResult): FeedbackOnlyResult =>
  result.reason === undefined ? {} : { warning: result.reason }
