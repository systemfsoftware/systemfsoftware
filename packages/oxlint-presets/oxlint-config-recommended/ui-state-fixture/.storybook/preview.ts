const captureEachStory = async (): Promise<void> => {
  if (import.meta.env.MODE !== 'test') return
  const [{ onTestFinished }, { page }, { screenshot }] = await Promise.all([
    import('@systemfsoftware/vitest'),
    import('vitest/browser'),
    import('@storycap-testrun/browser'),
  ])
  onTestFinished(async (context) => {
    await screenshot(page, context)
  })
}

export default { beforeEach: captureEachStory }
