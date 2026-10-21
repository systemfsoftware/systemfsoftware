import { useEffect } from 'react'

export function Title({ text }: { readonly text: string }) {
  useEffect(() => {
    globalThis.document.title = text
  }, [text])
  return <h1>{text}</h1>
}
