import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext {
    strykerContainerId: string
  }
}
