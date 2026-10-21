import { useRef } from 'react'

export function Latest({ value }: { readonly value: number }) {
  const latest = useRef(value)
  return <output>{latest.current}</output>
}
