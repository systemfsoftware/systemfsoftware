import { screenshot } from '@storycap-testrun/browser'
import { afterEach } from 'vitest'
import { page } from 'vitest/browser'

afterEach(async (context) => {
  await screenshot(page, context)
})
