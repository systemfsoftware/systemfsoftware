declare module '@storycap-testrun/browser' {
  export const screenshot: (page: unknown, context: unknown) => Promise<void>
}

declare module '@systemfsoftware/vitest' {
  export const onTestFinished: (handler: (context: unknown) => Promise<void>) => void
}

interface ImportMetaEnv {
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
