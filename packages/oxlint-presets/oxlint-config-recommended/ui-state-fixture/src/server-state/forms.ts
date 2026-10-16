import type * as ReactQuery from '@tanstack/react-query'
export { default as useSWR } from 'swr'
export const loadUrql = async (): Promise<unknown> => import('urql')

export type ReactQueryModule = typeof ReactQuery
