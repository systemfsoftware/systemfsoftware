import * as React from 'react'

export const useCount = (): number => React.useState(0)[0]
