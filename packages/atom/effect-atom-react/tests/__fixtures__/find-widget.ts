import { screen, waitFor } from '@testing-library/react'

interface WidgetShowing {
  readonly testId: string
  readonly text: string
}

/** Waits until the widget shows this text, then hands it back so the step's check runs on a settled state. */
export const findWidgetShowing = ({ testId, text }: WidgetShowing): Promise<HTMLElement> =>
  waitFor(() => {
    const widget = screen.getByTestId(testId)
    if (widget.textContent !== text) {
      throw new Error(`the widget ${testId} shows ${JSON.stringify(widget.textContent)}, not ${JSON.stringify(text)}`)
    }
    return widget
  })
