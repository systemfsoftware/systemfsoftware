declare global {
  interface ImportMeta {
    readonly vitest?: Record<string, never>
  }
}

export {}
