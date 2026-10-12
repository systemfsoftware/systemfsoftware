import * as apolloClientReact from '@apollo/client/react'
import * as reduxToolkitQueryReact from '@reduxjs/toolkit/query/react'
import * as tanstackReactQuery from '@tanstack/react-query'
import * as tanstackReactQueryDevtools from '@tanstack/react-query-devtools'
import * as tanstackReactQueryNextExperimental from '@tanstack/react-query-next-experimental'
import * as tanstackReactQueryPersistClient from '@tanstack/react-query-persist-client'
import * as trpcReactQuery from '@trpc/react-query'
import * as trpcTanstackReactQuery from '@trpc/tanstack-react-query'
import * as reactQuery from 'react-query'
import * as swr from 'swr'
import * as urql from 'urql'

export const modules: readonly unknown[] = [
  tanstackReactQuery,
  tanstackReactQueryDevtools,
  tanstackReactQueryPersistClient,
  tanstackReactQueryNextExperimental,
  reactQuery,
  swr,
  urql,
  apolloClientReact,
  reduxToolkitQueryReact,
  trpcReactQuery,
  trpcTanstackReactQuery,
]
