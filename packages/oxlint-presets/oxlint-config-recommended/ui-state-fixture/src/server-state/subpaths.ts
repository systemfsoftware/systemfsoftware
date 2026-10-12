import * as apolloClientReact from '@apollo/client/react/ssr'
import * as reduxToolkitQueryReact from '@reduxjs/toolkit/query/react/dist/index'
import * as tanstackReactQueryDevtools from '@tanstack/react-query-devtools/production'
import * as tanstackReactQueryNextExperimental from '@tanstack/react-query-next-experimental/build/modern'
import * as tanstackReactQueryPersistClient from '@tanstack/react-query-persist-client/build/modern'
import * as tanstackReactQuery from '@tanstack/react-query/build/modern'
import * as trpcReactQuery from '@trpc/react-query/rsc'
import * as trpcTanstackReactQuery from '@trpc/tanstack-react-query/dist/index'
import * as reactQuery from 'react-query/devtools'
import * as swr from 'swr/infinite'
import * as urql from 'urql/dist/urql.mjs'

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
