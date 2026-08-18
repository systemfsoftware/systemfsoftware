export interface Logger {
  isTraceEnabled(): boolean
  isDebugEnabled(): boolean
  isInfoEnabled(): boolean
  isWarnEnabled(): boolean
  isErrorEnabled(): boolean
  isFatalEnabled(): boolean

  trace(message: string, ...args: readonly unknown[]): void
  debug(message: string, ...args: readonly unknown[]): void
  info(message: string, ...args: readonly unknown[]): void
  warn(message: string, ...args: readonly unknown[]): void
  error(message: string, ...args: readonly unknown[]): void
  fatal(message: string, ...args: readonly unknown[]): void
}
