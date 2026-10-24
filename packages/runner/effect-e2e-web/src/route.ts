import type { Route } from '@systemfsoftware/effect-e2e/engine'

export const routeOf = (url: string): Route => {
  const parsed = new URL(url)
  return { origin: parsed.origin, path: parsed.pathname, query: [...parsed.searchParams] }
}
