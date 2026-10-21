declare module 'react'
declare module 'react/jsx-runtime'
declare module '@systemfsoftware/effect-atom'

declare namespace JSX {
  type Element = unknown
  interface IntrinsicElements {
    readonly [element: string]: unknown
  }
}
