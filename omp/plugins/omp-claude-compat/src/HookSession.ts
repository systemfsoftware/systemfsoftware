import type { InputEvent } from '@oh-my-pi/pi-coding-agent'

/**
 * The slice of the harness these operations actually depend on. Narrowing here
 * keeps the executor off the full `ExtensionContext` union surface and lets a
 * caller — production or test — supply exactly what is used, with no cast.
 */
export interface HookSession {
  readonly cwd: string
  readonly homeDir: string
  readonly sessionManager: { readonly getSessionId: () => string }
  readonly ui: { readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void }
}

export interface HookToolCall {
  readonly toolName: string
  readonly toolCallId: string
  /** The harness types this per tool, so it is decoded rather than asserted. */
  readonly input: object
}

export interface HookToolResult extends HookToolCall {
  readonly content: unknown
  readonly isError?: boolean | undefined
}

export interface HookPrompt {
  readonly text: string
  readonly source: InputEvent['source']
  readonly images?: InputEvent['images']
}
