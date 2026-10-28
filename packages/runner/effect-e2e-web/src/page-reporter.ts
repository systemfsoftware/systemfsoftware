export const PAGE_REPORT_BINDING = '__e2eReportPage'

export interface PageReportSent {
  readonly kind: string
  readonly url: string
  readonly record: string
}

declare global {
  interface Window {
    readonly [PAGE_REPORT_BINDING]?: (report: PageReportSent) => Promise<void>
  }
}

export const reportPage = (): void => {
  const send = (kind: string, record: string): void => {
    void window.__e2eReportPage?.({ kind, url: location.href, record })
  }
  let navigationSent = false
  const sendNavigation = (entry: PerformanceEntry): void => {
    if (navigationSent) return
    navigationSent = true
    send('Navigation', JSON.stringify(entry))
  }
  performance.getEntriesByType('navigation').slice(0, 1).forEach(sendNavigation)
  new PerformanceObserver((list) => list.getEntries().forEach(sendNavigation)).observe({
    type: 'navigation',
    buffered: true,
  })
  new PerformanceObserver((list) => list.getEntries().forEach((entry) => send('LayoutShift', JSON.stringify(entry))))
    .observe({ type: 'layout-shift', buffered: true })
  addEventListener(
    'pagereveal',
    (event) => send('Reveal', JSON.stringify({ viewTransition: event.viewTransition !== null })),
  )
}
