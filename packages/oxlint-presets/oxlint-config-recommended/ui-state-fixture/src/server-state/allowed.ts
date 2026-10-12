import * as apolloClient from '@apollo/client'
import * as reduxToolkitQuery from '@reduxjs/toolkit/query'
import * as tanstackQueryCore from '@tanstack/query-core'
import * as urqlCore from '@urql/core'

export const modules: readonly unknown[] = [tanstackQueryCore, apolloClient, urqlCore, reduxToolkitQuery]
