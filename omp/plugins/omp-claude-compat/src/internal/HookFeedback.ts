/** @internal */
export interface HooksForEventResult {
  readonly block?: boolean
  readonly reason?: string
  readonly warning?: string
  readonly updatedInput?: Record<string, unknown>
}

/** @internal */
export type FeedbackOnlyResult = Omit<HooksForEventResult, 'block' | 'reason'>

/** @internal */
export const blockAsFeedback = (result: HooksForEventResult): FeedbackOnlyResult =>
  result.reason === undefined ? {} : { warning: result.reason }
