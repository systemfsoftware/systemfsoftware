import { useState } from 'react'

export function Toggle({ open }: { readonly open: boolean }) {
  if (open) {
    const [count] = useState(0)
    return <output>{count}</output>
  }
  return null
}
