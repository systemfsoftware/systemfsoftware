export type CloudflareErrorEntry = {
  readonly code: number
  readonly message: string
}

export type Envelope<A> = {
  readonly success: boolean
  readonly errors: ReadonlyArray<CloudflareErrorEntry>
  readonly messages: ReadonlyArray<string>
  readonly result: A | null
}

export type PageInfo = {
  readonly page: number
  readonly per_page: number
  readonly total_count: number
}

export type ListEnvelope<A> = {
  readonly success: boolean
  readonly errors: ReadonlyArray<CloudflareErrorEntry>
  readonly messages: ReadonlyArray<string>
  readonly result: ReadonlyArray<A>
  readonly result_info: {
    readonly count: number
    readonly page: number
    readonly per_page: number
    readonly total_count: number
  }
}

export const successEnvelope = <A>(result: A): Envelope<A> => ({
  success: true,
  errors: [],
  messages: [],
  result,
})

export const failureEnvelope = (error: CloudflareErrorEntry): Envelope<never> => ({
  success: false,
  errors: [error],
  messages: [],
  result: null,
})

export const listEnvelope = <A>(
  options: { readonly result: ReadonlyArray<A>; readonly info: PageInfo },
): ListEnvelope<A> => ({
  success: true,
  errors: [],
  messages: [],
  result: options.result,
  result_info: {
    count: options.result.length,
    page: options.info.page,
    per_page: options.info.per_page,
    total_count: options.info.total_count,
  },
})
